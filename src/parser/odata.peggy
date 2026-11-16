// OData URL grammar (V2 and V4 / V4.01 request URLs).
//
// Hand-written PEG grammar producing the AST declared in ./ast.ts. It replaces a mechanical
// conversion of the OASIS ABNF, which PEG's ordered choice cannot express faithfully.
//
// Design notes
// - One grammar serves both protocol versions. Version specific constructs (V2 literals such
//   as datetime'..', V4 lambdas, $apply) are all accepted syntactically.
// - Whitespace, including line breaks and %20, is allowed around all delimiters so that
//   queries can be laid out over several lines in the editor.
// - The grammar does not know where the service root ends. It parses every path segment and
//   leaves the split into service root and resource path to ./parse.ts.
// - `options.tolerant` enables recovery productions (missing operands, unclosed parentheses,
//   trailing garbage). They embed `missing` and `junk` nodes into the tree instead of
//   failing, so that a best-effort tree is available for completions and metadata
//   diagnostics while the user is typing. Strict mode never produces those nodes.

{
  const tolerant = options.tolerant === true;

  // System query options whose value has a dedicated grammar.
  const TYPED = new Set([
    "filter", "orderby", "select", "expand", "compute", "apply", "search",
    "top", "skip", "index", "count", "inlinecount", "levels",
  ]);
  // System query options that are parsed as raw text.
  const RAW = new Set(["format", "skiptoken", "deltatoken", "id", "schemaversion"]);
  // Options that are treated as system query options even without the "$" prefix (4.01).
  // Others fall back to custom query options when their value does not parse.
  const BARE_STRICT = new Set(["filter", "orderby", "select", "expand", "compute", "apply"]);

  const TYPED_LITERALS = new Set([
    "datetime", "datetimeoffset", "time", "guid", "duration", "binary", "x",
    "geography", "geometry", "date", "timeofday",
  ]);

  // Transformations with a grammar of their own; anything else is parsed as a function.
  const STANDARD_TRANSFORMATIONS = new Set([
    "aggregate", "groupby", "filter", "search", "compute", "orderby", "concat", "expand",
    "join", "outerjoin", "nest", "addnested", "identity",
  ]);

  function span() {
    const l = location();
    return { start: l.start, end: l.end };
  }

  function node(type, props) {
    return Object.assign({ type }, props, { span: span() });
  }

  function chain(head, tail) {
    return tail.reduce(
      (left, t) => ({
        type: "binary",
        op: t.op.toLowerCase(),
        left,
        right: t.right,
        span: { start: left.span.start, end: t.right.span.end },
      }),
      head,
    );
  }

  function option(name, value, extra) {
    return node("option", Object.assign(
      { kind: "system", name: name.name, nameSpan: name.span, dollar: name.dollar, value },
      extra,
    ));
  }
}

root
  = _ uri:uri _ { return uri; }

uri
  = origin:origin segments:segments query:query? fragment:fragment? junk:junkAll?
    {
      return node("uri", {
        origin,
        segments,
        query: query ?? undefined,
        fragment: fragment ?? undefined,
        junk: junk ?? undefined,
      });
    }

origin
  = $([A-Za-z] [A-Za-z0-9+.-]* "://" [^/?# \t\r\n]+)
    { return node("origin", { text: text() }); }

fragment
  = _ "#" text:$[^ \t\r\n]* { return text; }

junkAll
  = &{ return tolerant; } _ text:$.+ { return node("junk", { text }); }

// ---------------------------------------------------------------------------------------
// Path
// ---------------------------------------------------------------------------------------

segments
  = (_ "/" _ @(segment / emptySegment))*

emptySegment
  = "" { return node("segment", { kind: "empty", name: "" }); }

segment
  = systemSegment
  / @nameSegment &segmentEnd
  / @keySegment &segmentEnd
  / rawSegment

segmentEnd
  = _ ("/" / "?" / "#" / !.)

systemSegment
  = name:systemName args:segmentArgs?
    { return node("segment", { kind: "system", name: name.name, nameSpan: name.span, args: args ?? undefined }); }

nameSegment
  = name:qualifiedNameNode args:segmentArgs? key:segmentArgs?
    {
      return node("segment", {
        kind: "name",
        name: name.name,
        nameSpan: name.span,
        args: args ?? undefined,
        key: key ?? undefined,
      });
    }

keySegment
  = value:literal
    { return node("segment", { kind: "key", name: text(), value }); }

// Not for what looks like a resource with an unclosed key predicate: let that be reported.
rawSegment
  = !(qualifiedName OPEN) text:$[^/?# \t\r\n]+
    { return node("segment", { kind: "raw", name: text }); }

segmentArgs
  = OPEN args:arg|.., COMMA| close { return args; }

arg
  = name:identifierNode _ EQ _ value:expr { return node("arg", { name, value }); }
  // condition:value pairs of the case() function
  / condition:expr _ COLON _ value:expr { return node("arg", { condition, value }); }
  / value:expr { return node("arg", { value }); }

// ---------------------------------------------------------------------------------------
// Query options
// ---------------------------------------------------------------------------------------

query
  = _ "?" _ options:(option?)|.., AMP| { return options.filter(Boolean); }

option
  = o:typedOption &{ return o.dollar; } junk:junk?
    { if (junk) { o.junk = junk; o.span = span(); } return o; }
  / rawOption
  / incompleteOption
  / aliasOption
  / o:typedOption &{ return BARE_STRICT.has(o.name.slice(1)); } junk:junk?
    { if (junk) { o.junk = junk; o.span = span(); } return o; }
  / @typedOption &optionEnd
  / customOption

optionEnd
  = _ ("&" / "#" / !.)

// Options allowed inside the parentheses of $expand and $select items, separated by ";".
nestedOption
  = o:(typedOption / nestedRawOption / incompleteOption / nestedAliasOption) junk:junk?
    { if (junk) { o.junk = junk; o.span = span(); } return o; }

optionName "query option"
  = dollar:DOLLAR? id:$[A-Za-z]+
    { return { name: "$" + id.toLowerCase(), key: id.toLowerCase(), dollar: dollar !== null, span: span() }; }

typedOption
  = name:optionName &{ return TYPED.has(name.key); } _ EQ _
    value:(
        &{ return name.key === "filter"; } @expr
      / &{ return name.key === "orderby"; } @orderby
      / &{ return name.key === "select"; } @select
      / &{ return name.key === "expand"; } @expand
      / &{ return name.key === "compute"; } @compute
      / &{ return name.key === "apply"; } @apply
      / &{ return name.key === "search"; } @search
      / &{ return name.key === "top" || name.key === "skip" || name.key === "index"; } @(integer / alias)
      / &{ return name.key === "count"; } @boolean
      / &{ return name.key === "inlinecount"; } @inlinecount
      / &{ return name.key === "levels"; } @levels
    )
    { return option(name, value); }

rawOption
  = name:optionName &{ return name.dollar && !TYPED.has(name.key); } _ EQ _ value:rawValue
    { return option(name, value, { unknown: !RAW.has(name.key) }); }

nestedRawOption
  = name:optionName &{ return !TYPED.has(name.key); } _ EQ _ value:nestedRawValue
    { return option(name, value, { unknown: !RAW.has(name.key) }); }

// A system query option that is still being typed: "$", "$fil", "$filter" without value,
// or a typed option whose value does not parse at all. Tolerant mode only.
incompleteOption
  = &{ return tolerant; } DOLLAR id:$[A-Za-z]* value:(_ EQ _ @nestedRawValue)?
    {
      return node("option", {
        kind: "system",
        name: "$" + id.toLowerCase(),
        nameSpan: span(),
        dollar: true,
        value: value ?? undefined,
        incomplete: true,
      });
    }

aliasOption
  = AT name:$identifier _ EQ _ value:(@expr &optionEnd / rawValue)
    { return node("option", { kind: "alias", name: "@" + name, value }); }

nestedAliasOption
  = AT name:$identifier _ EQ _ value:(@expr &(_ (";" / ")" / "%3B"i / "%29")) / nestedRawValue)
    { return node("option", { kind: "alias", name: "@" + name, value }); }

customOption "query option"
  = name:$([^=&#$@ \t\r\n] [^=&# \t\r\n]*) value:(_ EQ @rawValue)?
    { return node("option", { kind: "custom", name, value: value ?? undefined }); }

rawValue
  = text:$[^&]* { return node("raw", { text: text.trim() }); }

nestedRawValue
  = text:$[^&;)]* { return node("raw", { text: text.trim() }); }

// Unparseable remainder of an option value. Tolerant mode only.
junk
  = &{ return tolerant; } _ @(text:$(!ws [^&;)] [^&;)]*) { return node("junk", { text }); })

integer "integer"
  = digits:$[0-9]+ { return node("literal", { kind: "int", text: digits }); }

boolean
  = value:$("true"i / "false"i) !identifierPart { return node("literal", { kind: "boolean", text: value }); }

inlinecount
  = value:$("allpages"i / "none"i) !identifierPart { return node("raw", { text: value }); }

levels
  = integer
  / value:$"max"i !identifierPart { return node("raw", { text: value }); }

// --- $orderby ---------------------------------------------------------------------------

orderby
  = items:orderbyItem|1.., COMMA| { return node("orderby", { items }); }

orderbyItem
  = expr:expr direction:(__ @$("asc"i / "desc"i) !identifierPart)?
    { return node("orderbyItem", { expr, direction: direction ? direction.toLowerCase() : undefined }); }

// --- $select ----------------------------------------------------------------------------

select
  = items:selectItem|1.., COMMA| { return node("select", { items }); }

selectItem
  = STAR { return node("selectItem", { path: [], star: true }); }
  / ns:qualifiedNameNode ".*" { return node("selectItem", { path: [ns], star: true }); }
  // bound operation with parameter names to pick an overload: NS.Func(a,b)
  / path:itemPath OPEN signature:identifierNode|1.., COMMA| CLOSE
    { return node("selectItem", { path, signature }); }
  / path:itemPath options:nestedOptions?
    { return node("selectItem", { path, options: options ?? undefined }); }

// --- $expand ----------------------------------------------------------------------------

expand
  = items:expandItem|1.., COMMA| { return node("expand", { items }); }

expandItem
  = path:(@itemName "/")* STAR suffix:("/" DOLLAR @$"ref"i)? options:nestedOptions?
    {
      return node("expandItem", {
        path,
        star: true,
        suffix: suffix ? "$" + suffix.toLowerCase() : undefined,
        options: options ?? undefined,
      });
    }
  // media stream of the entity
  / DOLLAR "value"i !identifierPart
    { return node("expandItem", { path: [], suffix: "$value" }); }
  / path:itemPath suffix:("/" DOLLAR @$("ref"i / "count"i))? options:nestedOptions?
    {
      return node("expandItem", {
        path,
        suffix: suffix ? "$" + suffix.toLowerCase() : undefined,
        options: options ?? undefined,
      });
    }

itemPath
  = first:(itemName / missing) rest:("/" @(itemName / missingAfterSlash))*
    { return [first, ...rest]; }

itemName
  = qualifiedNameNode
  / name:annotationName { return node("name", { name }); }

missingAfterSlash
  = !DOLLAR !STAR @missing

nestedOptions
  = OPEN options:(nestedOption / &{ return tolerant; } "" { return null; })|1.., SEMI| close
    { return options.filter(Boolean); }

// --- $compute ---------------------------------------------------------------------------

compute
  = items:computeItem|1.., COMMA| { return node("compute", { items }); }

computeItem
  = expr:expr alias:asAlias { return node("computeItem", { expr, alias: alias ?? undefined }); }

asAlias
  = __ "as"i __ @identifierNode
  / &{ return tolerant; } (__ "as"i)? { return null; }

// --- $search ----------------------------------------------------------------------------

search
  = expr:searchOr { return node("search", { expr }); }

searchOr
  = head:searchAnd tail:(__ op:"OR" __ right:searchAnd { return { op, right }; })*
    { return chain(head, tail); }

searchAnd
  = head:searchNot tail:((__ "AND" __ / __ !("OR" __)) right:searchNot { return { op: "and", right }; })*
    { return chain(head, tail); }

searchNot
  = "NOT" __ operand:searchPrimary { return node("unary", { op: "not", operand }); }
  / searchPrimary

searchPrimary
  = OPEN expr:searchOr close { return node("paren", { expr }); }
  / DQUOTE text:$(!DQUOTE .)* (DQUOTE / &{ return tolerant; }) { return node("searchTerm", { text, phrase: true }); }
  // not in the specification, but in wide use
  / "'" text:$[^'&]* "'" { return node("searchTerm", { text, phrase: true }); }
  / !ws text:$([^&;()"] (!ws [^&;()])*) { return node("searchTerm", { text }); }

// --- $apply -----------------------------------------------------------------------------

apply
  = transformations:transformation|1.., _ "/" _| { return node("apply", { transformations }); }

transformation
  = "aggregate"i OPEN items:aggregateItem|1.., COMMA| close
    { return node("transformation", { name: "aggregate", aggregates: items }); }
  / "groupby"i OPEN OPEN properties:expr|.., COMMA| close then:(COMMA @apply)? close
    { return node("transformation", { name: "groupby", args: properties, then: then ?? undefined }); }
  / "filter"i OPEN expr:expr close
    { return node("transformation", { name: "filter", args: [expr] }); }
  / "search"i OPEN expr:search close
    { return node("transformation", { name: "search", search: expr }); }
  / "compute"i OPEN items:computeItem|1.., COMMA| close
    { return node("transformation", { name: "compute", computes: items }); }
  / "orderby"i OPEN items:orderbyItem|1.., COMMA| close
    { return node("transformation", { name: "orderby", orderby: items }); }
  / "concat"i OPEN sequences:apply|1.., COMMA| close
    { return node("transformation", { name: "concat", sequences }); }
  / "expand"i OPEN path:expr nested:(COMMA @transformation)* close
    { return node("transformation", { name: "expand", args: [path], nested }); }
  / name:$("join"i / "outerjoin"i / "nest"i / "addnested"i) OPEN path:expr alias:asAlias then:(COMMA @apply)? close
    { return node("transformation", { name: name.toLowerCase(), args: [path], alias: alias ?? undefined, then: then ?? undefined }); }
  / "identity"i !identifierPart
    { return node("transformation", { name: "identity" }); }
  / name:$qualifiedName &{ return !STANDARD_TRANSFORMATIONS.has(name.toLowerCase()); }
    OPEN args:expr|.., COMMA| close
    { return node("transformation", { name, args }); }

aggregateItem
  // Sales(Amount with sum as Total): aggregation along a navigation path
  = path:pathExpr OPEN items:aggregateItem|1.., COMMA| CLOSE &(_ ("," / ")" / "%2C"i / "%29"))
    { return node("aggregateItem", { path, items }); }
  / expr:expr method:(__ "with"i __ @$qualifiedName)? from:(__ "from"i __ @expr __ "with"i __ $qualifiedName)*
    alias:(__ "as"i __ @identifierNode)?
    &{ return tolerant || alias !== null || method === null; }
    {
      return node("aggregateItem", {
        expr,
        method: method ?? undefined,
        from: from.length ? from.map((f) => f[0]) : undefined,
        alias: alias ?? undefined,
      });
    }

// ---------------------------------------------------------------------------------------
// Expressions ($filter, $orderby, $compute, parameter values)
//
// Precedence follows OData 4.01 URL conventions 5.1.1.17, lowest first:
// or, and, eq/ne, gt/ge/lt/le, add/sub, mul/div/divby/mod, not/-, has/in, primary.
// ---------------------------------------------------------------------------------------

expr
  = orExpr

orExpr
  = head:andExpr tail:(__ op:"or"i __ right:andExpr { return { op, right }; })*
    { return chain(head, tail); }

andExpr
  = head:equalityExpr tail:(__ op:"and"i __ right:equalityExpr { return { op, right }; })*
    { return chain(head, tail); }

equalityExpr
  = head:relationalExpr tail:(__ op:("eq"i / "ne"i) __ right:relationalExpr { return { op, right }; })*
    { return chain(head, tail); }

relationalExpr
  = head:additiveExpr tail:(__ op:("gt"i / "ge"i / "lt"i / "le"i) __ right:additiveExpr { return { op, right }; })*
    { return chain(head, tail); }

additiveExpr
  = head:multiplicativeExpr tail:(__ op:("add"i / "sub"i) __ right:multiplicativeExpr { return { op, right }; })*
    { return chain(head, tail); }

multiplicativeExpr
  = head:unaryExpr tail:(__ op:("mul"i / "divby"i / "div"i / "mod"i) __ right:unaryExpr { return { op, right }; })*
    { return chain(head, tail); }

unaryExpr
  = "not"i (__ / &"(" / &"%28") operand:unaryExpr { return node("unary", { op: "not", operand }); }
  / "-" !([0-9] / "INF") _ operand:unaryExpr { return node("unary", { op: "neg", operand }); }
  / membershipExpr

membershipExpr
  = head:primaryExpr tail:(__ op:("has"i / "in"i) __ right:primaryExpr { return { op, right }; })*
    { return chain(head, tail); }

primaryExpr
  = literal
  / jsonArray
  / jsonObject
  / alias
  / parenExpr
  / pathExpr
  / missing

missing
  = &{ return tolerant; } "" { return node("missing", {}); }

parenExpr
  = OPEN items:expr|.., COMMA| close
    {
      return items.length === 1
        ? node("paren", { expr: items[0] })
        : node("list", { items });
    }

alias
  = AT name:$qualifiedName !"/" !"%23" { return node("alias", { name: "@" + name }); }

// --- Member paths, function calls, lambdas ----------------------------------------------

pathExpr
  = first:pathSegment rest:("/" @(pathSegment / missingMember))*
    { return node("path", { segments: [first, ...rest] }); }

missingMember
  = m:missing { return node("member", { name: "", nameSpan: m.span, missing: true }); }

pathSegment
  = lambda
  / DOLLAR "filter"i OPEN filter:expr close key:callArgs?
    { return node("system", { name: "$filter", filter, key: key ?? undefined }); }
  / name:systemName options:nestedOptions?
    { return node("system", { name: name.name, options: options ?? undefined }); }
  / name:annotationName
    { return node("annotation", { name }); }
  / name:qualifiedNameNode args:callArgs? key:callArgs?
    // all() without a predicate is no function call either
    &{ return tolerant || args === null || name.name.toLowerCase() !== "all"; }
    {
      return node("member", {
        name: name.name,
        nameSpan: name.span,
        args: args ?? undefined,
        key: key ?? undefined,
      });
    }

lambda
  = op:$("any"i / "all"i) OPEN body:(variable:identifierNode _ COLON _ predicate:expr { return { variable, predicate }; })? close
    &{ return tolerant || body !== null || op.toLowerCase() === "any"; }
    {
      return node("lambda", {
        op: op.toLowerCase(),
        variable: body ? body.variable : undefined,
        predicate: body ? body.predicate : undefined,
      });
    }

callArgs
  = OPEN args:arg|.., COMMA| close { return args; }

// --- Literals ---------------------------------------------------------------------------

literal "literal"
  = dateTimeLiteral
  / dateLiteral
  / timeLiteral
  / guidLiteral
  / numberLiteral
  / stringLiteral
  / typedLiteral
  / keywordLiteral

dateTimeLiteral
  = calendarDate "T"i DIGIT|2| (":" / "%3A"i) DIGIT|2|
    ((":" / "%3A"i) DIGIT|2| ("." DIGIT+)?)?
    zone:("Z"i / ([-+] / "%2B"i) DIGIT|2| (":" / "%3A"i) DIGIT|2|)? !identifierPart
    { return node("literal", { kind: zone ? "dateTimeOffset" : "dateTime", text: text() }); }

dateLiteral
  = calendarDate !identifierPart
    { return node("literal", { kind: "date", text: text() }); }

calendarDate
  = "-"? DIGIT|4| "-" month:$DIGIT|2| "-" day:$DIGIT|2|
    &{ return +month >= 1 && +month <= 12 && +day >= 1 && +day <= 31; }

timeLiteral
  = DIGIT|2| COLON DIGIT|2| (COLON DIGIT|2| ("." DIGIT+)?)? !identifierPart
    { return node("literal", { kind: "timeOfDay", text: text() }); }

guidLiteral
  = HEXDIG|8| "-" HEXDIG|4| "-" HEXDIG|4| "-" HEXDIG|4| "-" HEXDIG|12| !identifierPart
    { return node("literal", { kind: "guid", text: text() }); }

numberLiteral
  = ([-+] / "%2B"i)? DIGIT+ fraction:("." DIGIT+)? exponent:("e"i ([-+] / "%2B"i)? DIGIT+)? suffix:[LMFD]i? !identifierPart
    {
      const s = suffix ? suffix.toLowerCase() : "";
      const kind = s === "l" ? "int"
        : s === "m" ? "decimal"
        : s === "f" || s === "d" || exponent ? "double"
        : fraction ? "decimal" : "int";
      return node("literal", { kind, text: text() });
    }

stringLiteral
  = value:quoted { return node("literal", { kind: "string", text: text(), unterminated: value.unterminated || undefined }); }

// datetime'2024-01-01T00:00', guid'..', duration'P1D', binary'..', X'..', geography'..',
// and enum literals such as Namespace.Color'Red,Green'.
typedLiteral
  = prefix:$qualifiedName quoted
    {
      const p = prefix.toLowerCase();
      return node("literal", {
        kind: TYPED_LITERALS.has(p) ? (p === "x" ? "binary" : p) : "enum",
        typeName: prefix,
        text: text(),
      });
    }

keywordLiteral
  = value:$("null" / "true"i / "false"i / "-INF" / "INF" / "NaN") !identifierPart
    {
      const v = value.toLowerCase();
      return node("literal", {
        kind: v === "null" ? "null" : v === "true" || v === "false" ? "boolean" : "double",
        text: value,
      });
    }

quoted
  = SQUOTE (SQUOTE SQUOTE / !SQUOTE .)* end:(SQUOTE / &{ return tolerant; })
    { return { unterminated: end === undefined }; }

// JSON-style collection and complex values, e.g. as function parameters or "in" operands.
jsonArray
  = ("[" / "%5B"i) _ items:jsonValue|.., COMMA| _ ("]" / "%5D"i) { return node("array", { items }); }

jsonObject
  = ("{" / "%7B"i) _ members:jsonMember|.., COMMA| _ ("}" / "%7D"i) { return node("object", { members }); }

jsonMember
  = key:jsonString _ COLON _ value:jsonValue { return node("jsonMember", { key: key.text, value }); }

jsonValue
  = jsonString
  / expr

jsonString
  = DQUOTE (("\\" / "%5C"i) (DQUOTE / .) / !DQUOTE .)* DQUOTE { return node("literal", { kind: "string", text: text(), json: true }); }

// ---------------------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------------------

// @Namespace.Term with optional qualifier: @Measures.Currency%23Reporting
annotationName
  = AT name:$(qualifiedName ("%23" identifier)?) { return "@" + name; }

systemName
  = DOLLAR id:$identifier { return { name: "$" + id, span: span() }; }

qualifiedNameNode "name"
  = name:$qualifiedName { return node("name", { name }); }

identifierNode "name"
  = name:$identifier { return node("name", { name }); }

qualifiedName
  = identifier ("." identifier)*

identifier
  = [A-Za-z_\u0080-￿] [A-Za-z0-9_\u0080-￿]*

identifierPart
  = [A-Za-z0-9_\u0080-￿]

DIGIT = [0-9]
HEXDIG = [0-9A-Fa-f]

DOLLAR = "$" / "%24"
AT = "@" / "%40"
STAR = "*" / "%2A"i
EQ = "=" / "%3D"i
COLON = ":" / "%3A"i
SQUOTE = "'" / "%27"
DQUOTE = '"' / "%22"

OPEN = ("(" / "%28") _
CLOSE = _ (")" / "%29")
COMMA = _ ("," / "%2C"i) _
SEMI = _ (";" / "%3B"i) _
AMP = _ "&" _

// A closing parenthesis, which may be missing in tolerant mode.
close
  = CLOSE
  / &{ return tolerant; }

// "+" stands for a space in URLs copied from a browser's address bar
ws
  = [ \t\r\n+]
  / "%20"
  / "%09"
  / "%0A"i
  / "%0D"i

// optional and mandatory whitespace
_ "whitespace" = ws*
__ "whitespace" = ws+
