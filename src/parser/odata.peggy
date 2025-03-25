root 
 = odataUri:odataUri
  / header:header
  / primitiveValue:primitiveValue
  {
    return {
      odataUri: odataUri,
      header: header,
      primitiveValue: primitiveValue
    }
  }
 
 
odataUri
  = s:serviceRoot o:odataRelativeUri?
  {
    return {
      serviceRoot: s,
      odataRelativeUri: o
    }
  }


header
  = content_id
  / isolation
  / odata_entityid
  / odata_error
  / odata_maxversion
  / odata_version
  / prefer

primitiveValue
  = booleanValue
  / guidValue
  / durationValue
  / dateTimeOffsetValue
  / dateValue
  / timeOfDayValue
  / enumValue
  / fullCollectionLiteral
  / fullLineStringLiteral
  / fullMultiPointLiteral
  / fullMultiLineStringLiteral
  / fullMultiPolygonLiteral
  / fullPointLiteral
  / fullPolygonLiteral
  / decimalValue
  / doubleValue
  / singleValue
  / sbyteValue
  / byteValue
  / int16Value
  / int32Value
  / int64Value
  / binaryValue

serviceRoot
  = ("https"i / "http"i) "://" host (":" port)? "/" (segment_nz "/")*
 { return text() }

odataRelativeUri
  = "$batch"i ("?" batchOptions)?
  / "$entity"i "?" entityOptions
  / "$entity"i "/" optionallyQualifiedEntityTypeName "?" entityCastOptions
  / "$metadata"i ("?" metadataOptions)? context?
  / r:resourcePath q:("?" queryOptions)?
  {
    return {
      resourcePath: r,
      queryOptions: q
    }
  }
  

content_id
  = "Content-ID"i ":" OWS request_id

isolation
  = "OData-"i? "Isolation"i ":" OWS "snapshot"i

odata_entityid
  = "OData-EntityID"i ":" OWS IRI_in_header

odata_error
  = "OData-Error"i ":" OWS "{%x22code%x22:"i (VCHAR / SP)*

odata_maxversion
  = "OData-MaxVersion"i ":" OWS DIGIT+ "." DIGIT+

odata_version
  = "OData-Version"i ":" OWS "4.0" oneToNine?

prefer
  = "Prefer"i ":" OWS preference (OWS "," OWS preference)*

booleanValue
  = "true"i
  / "false"i

guidValue
  = HEXDIG|8| "-" HEXDIG|4| "-" HEXDIG|4| "-" HEXDIG|4| "-" HEXDIG|12|

durationValue
  = SIGN? "P"i (DIGIT+ "D"i)? ("T"i (DIGIT+ "H"i)? (DIGIT+ "M"i)? (DIGIT+ ("." DIGIT+)? "S"i)?)?

dateTimeOffsetValue
  = year "-" month "-" day "T"i timeOfDayValue ("Z"i / SIGN hour ":" minute)

dateValue
  = year "-" month "-" day

timeOfDayValue
  = hour ":" minute (":" second ("." fractionalSeconds)?)?

enumValue
  = singleEnumValue (COMMA singleEnumValue)*

fullCollectionLiteral
  = sridLiteral collectionLiteral

fullLineStringLiteral
  = sridLiteral lineStringLiteral

fullMultiPointLiteral
  = sridLiteral multiPointLiteral

fullMultiLineStringLiteral
  = sridLiteral multiLineStringLiteral

fullMultiPolygonLiteral
  = sridLiteral multiPolygonLiteral

fullPointLiteral
  = sridLiteral pointLiteral

fullPolygonLiteral
  = sridLiteral polygonLiteral

decimalValue
  = SIGN? DIGIT+ ("." DIGIT+)? ("e"i SIGN? DIGIT+)?
  / nanInfinity

doubleValue
  = decimalValue

singleValue
  = decimalValue

sbyteValue
  = SIGN? DIGIT|1..3|

byteValue
  = DIGIT|1..3|

int16Value
  = SIGN? DIGIT|1..5|

int32Value
  = SIGN? DIGIT|1..10|

int64Value
  = SIGN? DIGIT|1..19|

binaryValue
  = (base64char|4|)* (base64b16 / base64b8)?

host
  = IP_literal
  / IPv4address
  / reg_name

port
  = DIGIT*

segment_nz
  = pchar+

batchOptions
  = batchOption ("&" batchOption)*

entityOptions
  = (entityIdOption "&")* id ("&" entityIdOption)*

optionallyQualifiedEntityTypeName
  = (namespace ".")? entityTypeName

entityCastOptions
  = (entityCastOption "&")* id ("&" entityCastOption)*

metadataOptions
  = metadataOption ("&" metadataOption)*

context
  = "#" contextFragment

resourcePath
  = entitySetName collectionNavigation?
  / singletonEntity singleNavigation?
  / actionImportCall
  / entityColFunctionImportCall collectionNavigation?
  / entityFunctionImportCall singleNavigation?
  / complexColFunctionImportCall complexColPath?
  / complexFunctionImportCall complexPath?
  / primitiveColFunctionImportCall primitiveColPath?
  / primitiveFunctionImportCall primitivePath?
  / functionImportCallNoParens querySegment?
  / crossjoin querySegment?
  / "$all"i ("/" optionallyQualifiedEntityTypeName)?

queryOptions
  = queryOption ("&" queryOption)*

OWS
  = (SP / HTAB)*

MWS
  = (SP / HTAB / CR / LF / CRLF)*

CR 
  = "\r"

LF
  = "\n"

CRLF
  = CR LF

request_id
  = unreserved+

IRI_in_header
  = (VCHAR / obs_text)+

VCHAR
  = [\x21-\x7e]

SP
  = " "

DIGIT
  = [\x30-\x39]

oneToNine
  = "1"
  / "2"
  / "3"
  / "4"
  / "5"
  / "6"
  / "7"
  / "8"
  / "9"

preference
  = allowEntityReferencesPreference
  / callbackPreference
  / continueOnErrorPreference
  / includeAnnotationsPreference
  / maxpagesizePreference
  / respondAsyncPreference
  / returnPreference
  / trackChangesPreference
  / waitPreference

HEXDIG
  = DIGIT
  / A_to_F

SIGN
  = "+"
  / "%2B"i
  / "-"

year
  = "-"? ("0" DIGIT|3| / oneToNine DIGIT|3..|)

month
  = "0" oneToNine
  / "1" ("0" / "1" / "2")

day
  = "0" oneToNine
  / ("1" / "2") DIGIT
  / "3" ("0" / "1")

hour
  = ("0" / "1") DIGIT
  / "2" ("0" / "1" / "2" / "3")

minute
  = zeroToFiftyNine

second
  = zeroToFiftyNine
  / "60"

fractionalSeconds
  = DIGIT|1..12|

singleEnumValue
  = enumerationMember
  / enumMemberValue

COMMA
  = ","
  / "%2C"i

sridLiteral
  = "SRID"i EQ DIGIT|1..5| SEMI

collectionLiteral
  = "Collection("i geoLiteral (COMMA geoLiteral)* CLOSE

lineStringLiteral
  = "LineString"i lineStringData

multiPointLiteral
  = "MultiPoint("i (pointData (COMMA pointData)*)? CLOSE

multiLineStringLiteral
  = "MultiLineString("i (lineStringData (COMMA lineStringData)*)? CLOSE

multiPolygonLiteral
  = "MultiPolygon("i (polygonData (COMMA polygonData)*)? CLOSE

pointLiteral
  = "Point"i pointData

polygonLiteral
  = "Polygon"i polygonData

nanInfinity
  = "NaN"i
  / "-INF"i
  / "INF"i

base64char
  = ALPHA
  / DIGIT
  / "-"
  / "_"

base64b16
  = base64char|2| ("A"i / "E"i / "I"i / "M"i / "Q"i / "U"i / "Y"i / "c"i / "g"i / "k"i / "o"i / "s"i / "w"i / "0" / "4" / "8") "="?

base64b8
  = base64char ("A"i / "Q"i / "g"i / "w"i) "=="?

IP_literal
  = "[" (IPv6address / IPvFuture) "]"

IPv4address
  = dec_octet "." dec_octet "." dec_octet "." dec_octet

reg_name
  = (unreserved / pct_encoded / sub_delims)*

pchar
  = unreserved
  / pct_encoded
  / sub_delims
  / ":"
  / "@"

batchOption
  = format
  / customQueryOption

entityIdOption
  = format
  / customQueryOption

id
  = ("$id"i / "id"i) EQ IRI_in_query

namespace
  = namespacePart ("." namespacePart)*

entityTypeName
  = odataIdentifier

entityCastOption
  = entityIdOption
  / expand
  / select

metadataOption
  = format
  / customQueryOption

contextFragment
  = "Collection($ref)"i
  / "$ref"i
  / "Collection(Edm.EntityType)"i
  / "Collection(Edm.ComplexType)"i
  / singletonEntity (navigation (containmentNavigation)* ("/" qualifiedEntityTypeName)?)? selectList?
  / qualifiedTypeName selectList?
  / entitySet ("/$deletedEntity"i / "/$link"i / "/$deletedLink"i)
  / entitySet keyPredicate "/" contextPropertyPath selectList?
  / entitySet selectList? ("/$entity"i / "/$delta"i)?

entitySetName
  = odataIdentifier

collectionNavigation
  = ("/" optionallyQualifiedEntityTypeName)? collectionNavPath?

singletonEntity
  = odataIdentifier

singleNavigation
  = ("/" optionallyQualifiedEntityTypeName)? ("/" propertyPath / boundOperation / ref / value / querySegment)?

actionImportCall
  = actionImport

entityColFunctionImportCall
  = entityColFunctionImport functionParameters

entityFunctionImportCall
  = entityFunctionImport functionParameters

complexColFunctionImportCall
  = complexColFunctionImport functionParameters

complexColPath
  = ordinalIndex
  / ("/" optionallyQualifiedComplexTypeName)? (count / boundOperation / querySegment)?

complexFunctionImportCall
  = complexFunctionImport functionParameters

complexPath
  = ("/" optionallyQualifiedComplexTypeName)? ("/" propertyPath / boundOperation / querySegment)?

primitiveColFunctionImportCall
  = primitiveColFunctionImport functionParameters

primitiveColPath
  = count
  / boundOperation
  / ordinalIndex
  / querySegment

primitiveFunctionImportCall
  = primitiveFunctionImport functionParameters

primitivePath
  = value
  / boundOperation
  / querySegment

functionImportCallNoParens
  = entityFunctionImport
  / entityColFunctionImport
  / complexFunctionImport
  / complexColFunctionImport
  / primitiveFunctionImport
  / primitiveColFunctionImport

querySegment
  = "/$query"i

crossjoin
  = "$crossjoin"i OPEN entitySetName (COMMA entitySetName)* CLOSE

queryOption
  = systemQueryOption
  / aliasAndValue
  / nameAndValue
  / customQueryOption

HTAB
  = "\t"

unreserved
  = ALPHA
  / DIGIT
  / "-"
  / "."
  / "_"
  / "~"

obs_text
  = [\x80-\xff]

allowEntityReferencesPreference
  = "odata."i? "allow-entityreferences"i

callbackPreference
  = "odata."i? "callback"i OWS ";" OWS "url"i EQ_h DQUOTE URI DQUOTE

continueOnErrorPreference
  = "odata."i? "continue-on-error"i (EQ_h booleanValue)?

includeAnnotationsPreference
  = "odata."i? "include-annotations"i EQ_h DQUOTE annotationsList DQUOTE

maxpagesizePreference
  = "odata."i? "maxpagesize"i EQ_h oneToNine DIGIT*

respondAsyncPreference
  = "respond-async"i

returnPreference
  = "return"i EQ_h ("representation"i / "minimal"i)

trackChangesPreference
  = "odata."i? "track-changes"i

waitPreference
  = "wait"i EQ_h DIGIT+

A_to_F
  = "A"i
  / "B"i
  / "C"i
  / "D"i
  / "E"i
  / "F"i

zeroToFiftyNine
  = ("0" / "1" / "2" / "3" / "4" / "5") DIGIT

enumerationMember
  = odataIdentifier

enumMemberValue
  = int64Value

EQ
  = "="

SEMI
  = ";"
  / "%3B"i

geoLiteral
  = collectionLiteral
  / lineStringLiteral
  / multiPointLiteral
  / multiLineStringLiteral
  / multiPolygonLiteral
  / pointLiteral
  / polygonLiteral

CLOSE
  = ")"
  / "%29"

lineStringData
  = OPEN positionLiteral (COMMA positionLiteral)+ CLOSE

pointData
  = OPEN positionLiteral CLOSE

polygonData
  = OPEN ringLiteral (COMMA ringLiteral)* CLOSE

ALPHA
  = [\x41-\x5a]
  / [\x61-\x7a]

IPv6address
  = (h16 ":")|6| ls32
  / "::" (h16 ":")|5| ls32
  / h16? "::" (h16 ":")|4| ls32
  / ((h16 ":")? h16)? "::" (h16 ":")|3| ls32
  / ((h16 ":")|..2| h16)? "::" (h16 ":")|2| ls32
  / ((h16 ":")|..3| h16)? "::" h16 ":" ls32
  / ((h16 ":")|..4| h16)? "::" ls32
  / ((h16 ":")|..5| h16)? "::" h16
  / ((h16 ":")|..6| h16)? "::"

IPvFuture
  = "v"i HEXDIG+ "." (unreserved / sub_delims / ":")+

dec_octet
  = "1" DIGIT|2|
  / "2" [\x30-\x34] DIGIT
  / "25" [\x30-\x35]
  / [\x31-\x39] DIGIT
  / DIGIT

pct_encoded
  = "%" HEXDIG HEXDIG

sub_delims
  = "$"
  / "&"
  / "'"
  / "="
  / other_delims

format
  = ("$format"i / "format"i) EQ ("atom"i / "json"i / "xml"i / pchar+ "/" pchar+)

customQueryOption
  = customName (EQ customValue)?

IRI_in_query
  = qchar_no_AMP+

namespacePart
  = odataIdentifier

odataIdentifier
  = identifierLeadingCharacter identifierCharacter|..127|
   { return  text() }

expand
  = ("$expand"i / "expand"i) EQ expandItem (COMMA expandItem)*

select
  = ("$select"i / "select"i) EQ selectItem (COMMA selectItem)*

navigation
  = ("/" complexProperty ("/" qualifiedComplexTypeName)?)* "/" navigationProperty

containmentNavigation
  = keyPredicate ("/" qualifiedEntityTypeName)? navigation

qualifiedEntityTypeName
  = namespace "." entityTypeName

selectList
  = OPEN (selectListItem (COMMA selectListItem)*)? CLOSE

qualifiedTypeName
  = singleQualifiedTypeName
  / "Collection"i OPEN singleQualifiedTypeName CLOSE

entitySet
  = entitySetName (containmentNavigation)* ("/" qualifiedEntityTypeName)?

keyPredicate
  = simpleKey
  / compoundKey
  / keyPathSegments

contextPropertyPath
  = primitiveProperty
  / primitiveColProperty
  / complexColProperty
  / complexProperty (("/" qualifiedComplexTypeName)? "/" contextPropertyPath)?

collectionNavPath
  = keyPredicate singleNavigation?
  / filterInPath collectionNavigation?
  / each boundOperation?
  / boundOperation
  / count
  / ref
  / querySegment

propertyPath
  = entityColNavigationProperty collectionNavigation?
  / entityNavigationProperty singleNavigation?
  / complexColProperty complexColPath?
  / complexProperty complexPath?
  / primitiveColProperty primitiveColPath?
  / primitiveProperty primitivePath?
  / streamProperty boundOperation?

boundOperation
  = "/" (boundActionCall / boundEntityColFunctionCall collectionNavigation? / boundEntityFunctionCall singleNavigation? / boundComplexColFunctionCall complexColPath? / boundComplexFunctionCall complexPath? / boundPrimitiveColFunctionCall primitiveColPath? / boundPrimitiveFunctionCall primitivePath? / boundFunctionCallNoParens querySegment?)

ref
  = "/$ref"i

value
  = "/$value"i

actionImport
  = odataIdentifier

entityColFunctionImport
  = odataIdentifier

functionParameters
  = OPEN (functionParameter (COMMA functionParameter)*)? CLOSE

entityFunctionImport
  = odataIdentifier

complexColFunctionImport
  = odataIdentifier

ordinalIndex
  = "/" DIGIT+

optionallyQualifiedComplexTypeName
  = (namespace ".")? complexTypeName

count
  = "/$count"i

complexFunctionImport
  = odataIdentifier

primitiveColFunctionImport
  = odataIdentifier

primitiveFunctionImport
  = odataIdentifier

OPEN
  = "("
  / "%28"

systemQueryOption
  = compute
  / deltatoken
  / expand
  / filter
  / format
  / id
  / inlinecount
  / orderby
  / schemaversion
  / search
  / select
  / skip
  / skiptoken
  / top
  / index

aliasAndValue
  = parameterAlias EQ parameterValue

nameAndValue
  = parameterName EQ parameterValue

EQ_h
  = BWS_h EQ BWS_h

DQUOTE
  = "\""

URI
  = scheme ":" hier_part ("?" query)? ("#" fragment)?

annotationsList
  = annotationIdentifier ("," annotationIdentifier)*

positionLiteral
  = doubleValue SP doubleValue (SP doubleValue)? (SP doubleValue)?

ringLiteral
  = OPEN positionLiteral (COMMA positionLiteral)* CLOSE

h16
  = HEXDIG|1..4|

ls32
  = (h16 ":" h16)
  / IPv4address

other_delims
  = "!"
  / "("
  / ")"
  / "*"
  / "+"
  / ","
  / ";"

customName
  = qchar_no_AMP_EQ_AT_DOLLAR (qchar_no_AMP_EQ)*

customValue
  = (qchar_no_AMP)*

qchar_no_AMP
  = unreserved
  / pct_encoded
  / other_delims
  / ":"
  / "@"
  / "/"
  / "?"
  / "$"
  / "'"
  / "="

identifierLeadingCharacter
  = ALPHA
  / "_"

identifierCharacter
  = ALPHA
  / "_"
  / DIGIT

expandItem
  = "$value"i
  / expandPath
  / optionallyQualifiedEntityTypeName "/" expandPath

selectItem
  = STAR
  / allOperationsInSchema
  / selectProperty
  / optionallyQualifiedActionName
  / optionallyQualifiedFunctionName
  / (optionallyQualifiedEntityTypeName / optionallyQualifiedComplexTypeName) "/" (selectProperty / optionallyQualifiedActionName / optionallyQualifiedFunctionName)

complexProperty
  = odataIdentifier

qualifiedComplexTypeName
  = namespace "." complexTypeName

navigationProperty
  = entityNavigationProperty
  / entityColNavigationProperty

selectListItem
  = STAR
  / allOperationsInSchema
  / ((qualifiedEntityTypeName / qualifiedComplexTypeName) "/")? (qualifiedActionName / qualifiedFunctionName / selectListProperty)

singleQualifiedTypeName
  = qualifiedEntityTypeName
  / qualifiedComplexTypeName
  / qualifiedTypeDefinitionName
  / qualifiedEnumTypeName
  / primitiveTypeName

simpleKey
  = OPEN (parameterAlias / keyPropertyValue) CLOSE

compoundKey
  = OPEN keyValuePair (COMMA keyValuePair)* CLOSE

keyPathSegments
  = ("/" keyPathLiteral)+

primitiveProperty
  = primitiveKeyProperty
  / primitiveNonKeyProperty

primitiveColProperty
  = odataIdentifier

complexColProperty
  = odataIdentifier

filterInPath
  = "/$filter"i OPEN boolCommonExpr CLOSE

each
  = "/$each"i

entityColNavigationProperty
  = odataIdentifier

entityNavigationProperty
  = odataIdentifier

streamProperty
  = odataIdentifier

boundActionCall
  = (namespace ".")? action

boundEntityColFunctionCall
  = (namespace ".")? entityColFunction functionParameters

boundEntityFunctionCall
  = (namespace ".")? entityFunction functionParameters

boundComplexColFunctionCall
  = (namespace ".")? complexColFunction functionParameters

boundComplexFunctionCall
  = (namespace ".")? complexFunction functionParameters

boundPrimitiveColFunctionCall
  = (namespace ".")? primitiveColFunction functionParameters

boundPrimitiveFunctionCall
  = (namespace ".")? primitiveFunction functionParameters

boundFunctionCallNoParens
  = (namespace ".")? entityFunction
  / (namespace ".")? entityColFunction
  / (namespace ".")? complexFunction
  / (namespace ".")? complexColFunction
  / (namespace ".")? primitiveFunction
  / (namespace ".")? primitiveColFunction

functionParameter
  = parameterName EQ (parameterAlias / primitiveLiteral)

complexTypeName
  = odataIdentifier

compute
  = ("$compute"i / "compute"i) EQ computeItem (COMMA computeItem)*

deltatoken
  = "$deltatoken"i EQ (qchar_no_AMP)+

filter
  = ("$filter"i / "filter"i) EQ boolCommonExpr

inlinecount
  = ("$count"i / "count"i) EQ booleanValue

orderby
  = ("$orderby"i / "orderby"i) EQ orderbyItem (COMMA orderbyItem)*

schemaversion
  = ("$schemaversion"i / "schemaversion"i) EQ (STAR / unreserved+)

search
  = ("$search"i / "search"i) EQ BWS (searchExpr / searchExpr_incomplete)

skip
  = ("$skip"i / "skip"i) EQ DIGIT+

skiptoken
  = "$skiptoken"i EQ (qchar_no_AMP)+

top
  = ("$top"i / "top"i) EQ DIGIT+

index
  = ("$index"i / "index"i) EQ DIGIT+

parameterAlias
  = AT odataIdentifier

parameterValue
  = arrayOrObject
  / commonExpr

parameterName
  = odataIdentifier

BWS_h
  = (SP / HTAB)*

scheme
  = ALPHA (ALPHA / DIGIT / "+" / "-" / ".")*

hier_part
  = "//" authority path_abempty
  / path_absolute
  / path_rootless

query
  = (pchar / "/" / "?")*

fragment
  = (pchar / "/" / "?")*

annotationIdentifier
  = excludeOperator? (STAR / namespace "." (termName / STAR)) ("#" odataIdentifier)?

qchar_no_AMP_EQ_AT_DOLLAR
  = unreserved
  / pct_encoded
  / other_delims
  / ":"
  / "/"
  / "?"
  / "'"

qchar_no_AMP_EQ
  = unreserved
  / pct_encoded
  / other_delims
  / ":"
  / "@"
  / "/"
  / "?"
  / "$"
  / "'"

expandPath
  = ((complexProperty / complexColProperty / optionallyQualifiedComplexTypeName / complexAnnotationInQuery) "/")* (STAR (ref / OPEN levels CLOSE)? / streamProperty / (navigationProperty / entityAnnotationInQuery) ("/" optionallyQualifiedEntityTypeName)? (ref (OPEN expandRefOption (SEMI expandRefOption)* CLOSE)? / count (OPEN expandCountOption (SEMI expandCountOption)* CLOSE)? / OPEN expandOption (SEMI expandOption)* CLOSE)?)

STAR
  = "*"
  / "%2A"i

allOperationsInSchema
  = namespace "." STAR

selectProperty
  = primitiveProperty
  / primitiveAnnotationInQuery
  / (primitiveColProperty / primitiveColAnnotationInQuery) (OPEN selectOptionPC (SEMI selectOptionPC)* CLOSE)?
  / navigationProperty
  / selectPath (OPEN selectOption (SEMI selectOption)* CLOSE / "/" selectProperty)?

optionallyQualifiedActionName
  = (namespace ".")? action

optionallyQualifiedFunctionName
  = (namespace ".")? function (OPEN parameterNames CLOSE)?

qualifiedActionName
  = namespace "." action

qualifiedFunctionName
  = namespace "." function (OPEN parameterNames CLOSE)?

selectListProperty
  = primitiveProperty
  / primitiveColProperty
  / (navigationProperty / entityAnnotationInFragment) "+"? selectList?
  / (complexProperty / complexColProperty / complexAnnotationInFragment) ("/" qualifiedComplexTypeName)? ("/" selectListProperty)?

qualifiedTypeDefinitionName
  = namespace "." typeDefinitionName

qualifiedEnumTypeName
  = namespace "." enumerationTypeName

primitiveTypeName
  = "Edm."i ("Binary"i / "Boolean"i / "Byte"i / "Date"i / "DateTimeOffset"i / "Decimal"i / "Double"i / "Duration"i / "Guid"i / "Int16"i / "Int32"i / "Int64"i / "SByte"i / "Single"i / "Stream"i / "String"i / "TimeOfDay"i / abstractSpatialTypeName concreteSpatialTypeName?)

keyPropertyValue
  = primitiveLiteral

keyValuePair
  = (primitiveKeyProperty / keyPropertyAlias) EQ (parameterAlias / keyPropertyValue)

keyPathLiteral
  = pchar*

primitiveKeyProperty
  = odataIdentifier

primitiveNonKeyProperty
  = odataIdentifier

boolCommonExpr
  = commonExpr

action
  = odataIdentifier

entityColFunction
  = odataIdentifier

entityFunction
  = odataIdentifier

complexColFunction
  = odataIdentifier

complexFunction
  = odataIdentifier

primitiveColFunction
  = odataIdentifier

primitiveFunction
  = odataIdentifier

primitiveLiteral
  = nullValue
  / booleanValue
  / guidValue
  / dateTimeOffsetValueInUrl
  / dateValue
  / timeOfDayValueInUrl
  / decimalValue
  / doubleValue
  / singleValue
  / sbyteValue
  / byteValue
  / int16Value
  / int32Value
  / int64Value
  / string
  / duration
  / enum
  / binary
  / geographyCollection
  / geographyLineString
  / geographyMultiLineString
  / geographyMultiPoint
  / geographyMultiPolygon
  / geographyPoint
  / geographyPolygon
  / geometryCollection
  / geometryLineString
  / geometryMultiLineString
  / geometryMultiPoint
  / geometryMultiPolygon
  / geometryPoint
  / geometryPolygon

computeItem
  = commonExpr RWS "as"i RWS computedProperty

orderbyItem
  = commonExpr (RWS ("asc"i / "desc"i))?

BWS
  = (SP / HTAB / "%20" / "%09")*

searchExpr
  = (searchParenExpr / searchNegateExpr / searchPhrase / searchWord) (searchOrExpr / searchAndExpr)?

searchExpr_incomplete
  = SQUOTE (SQUOTE_in_string / qchar_no_AMP_SQUOTE / quotation_mark / SP)* SQUOTE

AT
  = "@"
  / "%40"

arrayOrObject
  = array
  / object

commonExpr
  = (primitiveLiteral / arrayOrObject / rootExpr / firstMemberExpr / functionExpr / negateExpr / methodCallExpr / parenExpr / castExpr / isofExpr / notExpr) (addExpr / subExpr / mulExpr / divExpr / divbyExpr / modExpr)? (eqExpr / neExpr / ltExpr / leExpr / gtExpr / geExpr / hasExpr / inExpr)? (andExpr / orExpr)?

authority
  = (userinfo "@")? host (":" port)?

path_abempty
  = ("/" segment)*

path_absolute
  = "/" (segment_nz ("/" segment)*)?

path_rootless
  = segment_nz ("/" segment)*

excludeOperator
  = "-"

termName
  = odataIdentifier

complexAnnotationInQuery
  = annotationInQuery

levels
  = ("$levels"i / "levels"i) EQ (oneToNine DIGIT* / "max"i)

entityAnnotationInQuery
  = annotationInQuery

expandRefOption
  = expandCountOption
  / orderby
  / skip
  / top
  / inlinecount

expandCountOption
  = filter
  / search

expandOption
  = expandRefOption
  / select
  / expand
  / compute
  / levels
  / aliasAndValue

primitiveAnnotationInQuery
  = annotationInQuery

primitiveColAnnotationInQuery
  = annotationInQuery

selectOptionPC
  = filter
  / search
  / inlinecount
  / orderby
  / skip
  / top

selectPath
  = (complexProperty / complexColProperty / complexAnnotationInQuery) ("/" optionallyQualifiedComplexTypeName)?

selectOption
  = selectOptionPC
  / compute
  / select
  / aliasAndValue

function
  = entityFunction
  / entityColFunction
  / complexFunction
  / complexColFunction
  / primitiveFunction
  / primitiveColFunction

parameterNames
  = parameterName (COMMA parameterName)*

entityAnnotationInFragment
  = annotationInFragment

complexAnnotationInFragment
  = annotationInFragment

typeDefinitionName
  = odataIdentifier

enumerationTypeName
  = odataIdentifier

abstractSpatialTypeName
  = "Geography"i
  / "Geometry"i

concreteSpatialTypeName
  = "Collection"i
  / "LineString"i
  / "MultiLineString"i
  / "MultiPoint"i
  / "MultiPolygon"i
  / "Point"i
  / "Polygon"i

keyPropertyAlias
  = odataIdentifier

nullValue
  = "null"i

dateTimeOffsetValueInUrl
  = year "-" month "-" day "T"i timeOfDayValueInUrl ("Z"i / SIGN hour COLON minute)

timeOfDayValueInUrl
  = hour COLON minute (COLON second ("." fractionalSeconds)?)?

string
  = SQUOTE (SQUOTE_in_string / pchar_no_SQUOTE)* SQUOTE

duration
  = "duration"i? SQUOTE durationValue SQUOTE

enum
  = qualifiedEnumTypeName? SQUOTE enumValue SQUOTE

binary
  = "binary"i SQUOTE binaryValue SQUOTE

geographyCollection
  = geographyPrefix SQUOTE fullCollectionLiteral SQUOTE

geographyLineString
  = geographyPrefix SQUOTE fullLineStringLiteral SQUOTE

geographyMultiLineString
  = geographyPrefix SQUOTE fullMultiLineStringLiteral SQUOTE

geographyMultiPoint
  = geographyPrefix SQUOTE fullMultiPointLiteral SQUOTE

geographyMultiPolygon
  = geographyPrefix SQUOTE fullMultiPolygonLiteral SQUOTE

geographyPoint
  = geographyPrefix SQUOTE fullPointLiteral SQUOTE

geographyPolygon
  = geographyPrefix SQUOTE fullPolygonLiteral SQUOTE

geometryCollection
  = geometryPrefix SQUOTE fullCollectionLiteral SQUOTE

geometryLineString
  = geometryPrefix SQUOTE fullLineStringLiteral SQUOTE

geometryMultiLineString
  = geometryPrefix SQUOTE fullMultiLineStringLiteral SQUOTE

geometryMultiPoint
  = geometryPrefix SQUOTE fullMultiPointLiteral SQUOTE

geometryMultiPolygon
  = geometryPrefix SQUOTE fullMultiPolygonLiteral SQUOTE

geometryPoint
  = geometryPrefix SQUOTE fullPointLiteral SQUOTE

geometryPolygon
  = geometryPrefix SQUOTE fullPolygonLiteral SQUOTE

RWS
  = (SP / HTAB / "%20" / "%09")+

computedProperty
  = odataIdentifier

searchParenExpr
  = OPEN BWS searchExpr BWS CLOSE

searchNegateExpr
  = "NOT"i RWS searchExpr

searchPhrase
  = quotation_mark (qchar_no_AMP_DQUOTE / SP)+ quotation_mark

searchWord
  = searchChar (searchChar / SQUOTE)*

searchOrExpr
  = RWS "OR"i RWS searchExpr

searchAndExpr
  = RWS ("AND"i RWS)? searchExpr

SQUOTE
  = "'"
  / "%27"

SQUOTE_in_string
  = SQUOTE SQUOTE

qchar_no_AMP_SQUOTE
  = unreserved
  / pct_encoded
  / other_delims
  / ":"
  / "@"
  / "/"
  / "?"
  / "$"
  / "="

quotation_mark
  = DQUOTE
  / "%22"

array
  = begin_array (valueInUrl (value_separator valueInUrl)*)? end_array

object
  = begin_object (member (value_separator member)*)? end_object

rootExpr
  = "$root/"i (entitySetName keyPredicate / singletonEntity) singleNavigationExpr?

firstMemberExpr
  = memberExpr
  / inscopeVariableExpr ("/" memberExpr)?

functionExpr
  = (namespace ".")? (entityColFunction functionExprParameters collectionNavigationExpr? / entityFunction functionExprParameters singleNavigationExpr? / complexColFunction functionExprParameters complexColPathExpr? / complexFunction functionExprParameters complexPathExpr? / primitiveColFunction functionExprParameters collectionPathExpr? / primitiveFunction functionExprParameters primitivePathExpr?)

negateExpr
  = "-" BWS commonExpr

methodCallExpr
  = indexOfMethodCallExpr
  / toLowerMethodCallExpr
  / toUpperMethodCallExpr
  / trimMethodCallExpr
  / substringMethodCallExpr
  / concatMethodCallExpr
  / lengthMethodCallExpr
  / matchesPatternMethodCallExpr
  / yearMethodCallExpr
  / monthMethodCallExpr
  / dayMethodCallExpr
  / hourMethodCallExpr
  / minuteMethodCallExpr
  / secondMethodCallExpr
  / fractionalsecondsMethodCallExpr
  / totalsecondsMethodCallExpr
  / dateMethodCallExpr
  / timeMethodCallExpr
  / roundMethodCallExpr
  / floorMethodCallExpr
  / ceilingMethodCallExpr
  / distanceMethodCallExpr
  / geoLengthMethodCallExpr
  / totalOffsetMinutesMethodCallExpr
  / minDateTimeMethodCallExpr
  / maxDateTimeMethodCallExpr
  / nowMethodCallExpr
  / caseMethodCallExpr
  / boolMethodCallExpr

parenExpr
  = OPEN BWS commonExpr BWS CLOSE

castExpr
  = "cast"i OPEN BWS (commonExpr BWS COMMA BWS)? optionallyQualifiedTypeName BWS CLOSE

isofExpr
  = "isof"i OPEN BWS (commonExpr BWS COMMA BWS)? optionallyQualifiedTypeName BWS CLOSE

notExpr
  = "not"i RWS boolCommonExpr

addExpr
  = RWS "add"i RWS commonExpr

subExpr
  = RWS "sub"i RWS commonExpr

mulExpr
  = RWS "mul"i RWS commonExpr

divExpr
  = RWS "div"i RWS commonExpr

divbyExpr
  = RWS "divby"i RWS commonExpr

modExpr
  = RWS "mod"i RWS commonExpr

eqExpr
  = RWS "eq"i RWS commonExpr

neExpr
  = RWS "ne"i RWS commonExpr

ltExpr
  = RWS "lt"i RWS commonExpr

leExpr
  = RWS "le"i RWS commonExpr

gtExpr
  = RWS "gt"i RWS commonExpr

geExpr
  = RWS "ge"i RWS commonExpr

hasExpr
  = RWS "has"i RWS enum

inExpr
  = RWS "in"i RWS (listExpr / commonExpr)

andExpr
  = RWS "and"i RWS boolCommonExpr

orExpr
  = RWS "or"i RWS boolCommonExpr

userinfo
  = (unreserved / pct_encoded / sub_delims / ":")*

segment
  = pchar*

annotationInQuery
  = AT (namespace ".")? termName (HASH annotationQualifier)?

annotationInFragment
  = AT (namespace ".")? termName ("#" annotationQualifier)?

COLON
  = ":"
  / "%3A"i

pchar_no_SQUOTE
  = unreserved
  / pct_encoded_no_SQUOTE
  / other_delims
  / "$"
  / "&"
  / "="
  / ":"
  / "@"
  / SP // not spec but most services allow

geographyPrefix
  = "geography"i

geometryPrefix
  = "geometry"i

qchar_no_AMP_DQUOTE
  = unreserved
  / pct_encoded_no_DQUOTE
  / other_delims
  / ":"
  / "@"
  / "/"
  / "?"
  / "$"
  / "'"
  / "="

searchChar
  = unreserved
  / pct_encoded_no_DQUOTE
  / "!"
  / "*"
  / "+"
  / ","
  / ":"
  / "@"
  / "/"
  / "?"
  / "$"
  / "="

begin_array
  = BWS ("[" / "%5B"i) BWS

valueInUrl
  = stringInUrl
  / commonExpr

value_separator
  = BWS COMMA BWS

end_array
  = BWS ("]" / "%5D"i)

begin_object
  = BWS ("{" / "%7B"i) BWS

member
  = stringInUrl name_separator valueInUrl

end_object
  = BWS ("}" / "%7D"i)

singleNavigationExpr
  = "/" memberExpr

memberExpr
  = directMemberExpr
  / (optionallyQualifiedEntityTypeName / optionallyQualifiedComplexTypeName) "/" directMemberExpr

inscopeVariableExpr
  = implicitVariableExpr
  / parameterAlias
  / lambdaVariableExpr

functionExprParameters
  = OPEN (functionExprParameter (COMMA functionExprParameter)*)? CLOSE

collectionNavigationExpr
  = ("/" optionallyQualifiedEntityTypeName)? (collectionPathExpr / keyPredicate singleNavigationExpr? / filterExpr collectionNavigationExpr?)

complexColPathExpr
  = collectionPathExpr
  / "/" optionallyQualifiedComplexTypeName collectionPathExpr?

complexPathExpr
  = "/" directMemberExpr
  / "/" optionallyQualifiedComplexTypeName ("/" directMemberExpr)?

collectionPathExpr
  = count (OPEN expandCountOption (SEMI expandCountOption)* CLOSE)?
  / filterExpr collectionPathExpr?
  / "/" anyExpr
  / "/" allExpr
  / "/" boundFunctionExpr
  / "/" annotationExpr

primitivePathExpr
  = "/" (annotationExpr / boundFunctionExpr)?

indexOfMethodCallExpr
  = "indexof"i OPEN BWS commonExpr BWS COMMA BWS commonExpr BWS CLOSE

toLowerMethodCallExpr
  = "tolower"i OPEN BWS commonExpr BWS CLOSE

toUpperMethodCallExpr
  = "toupper"i OPEN BWS commonExpr BWS CLOSE

trimMethodCallExpr
  = "trim"i OPEN BWS commonExpr BWS CLOSE

substringMethodCallExpr
  = "substring"i OPEN BWS commonExpr BWS COMMA BWS commonExpr BWS (COMMA BWS commonExpr BWS)? CLOSE

concatMethodCallExpr
  = "concat"i OPEN BWS commonExpr BWS COMMA BWS commonExpr BWS CLOSE

lengthMethodCallExpr
  = "length"i OPEN BWS commonExpr BWS CLOSE

matchesPatternMethodCallExpr
  = "matchesPattern"i OPEN BWS commonExpr BWS COMMA BWS commonExpr BWS CLOSE

yearMethodCallExpr
  = "year"i OPEN BWS commonExpr BWS CLOSE

monthMethodCallExpr
  = "month"i OPEN BWS commonExpr BWS CLOSE

dayMethodCallExpr
  = "day"i OPEN BWS commonExpr BWS CLOSE

hourMethodCallExpr
  = "hour"i OPEN BWS commonExpr BWS CLOSE

minuteMethodCallExpr
  = "minute"i OPEN BWS commonExpr BWS CLOSE

secondMethodCallExpr
  = "second"i OPEN BWS commonExpr BWS CLOSE

fractionalsecondsMethodCallExpr
  = "fractionalseconds"i OPEN BWS commonExpr BWS CLOSE

totalsecondsMethodCallExpr
  = "totalseconds"i OPEN BWS commonExpr BWS CLOSE

dateMethodCallExpr
  = "date"i OPEN BWS commonExpr BWS CLOSE

timeMethodCallExpr
  = "time"i OPEN BWS commonExpr BWS CLOSE

roundMethodCallExpr
  = "round"i OPEN BWS commonExpr BWS CLOSE

floorMethodCallExpr
  = "floor"i OPEN BWS commonExpr BWS CLOSE

ceilingMethodCallExpr
  = "ceiling"i OPEN BWS commonExpr BWS CLOSE

distanceMethodCallExpr
  = "geo.distance"i OPEN BWS commonExpr BWS COMMA BWS commonExpr BWS CLOSE

geoLengthMethodCallExpr
  = "geo.length"i OPEN BWS commonExpr BWS CLOSE

totalOffsetMinutesMethodCallExpr
  = "totaloffsetminutes"i OPEN BWS commonExpr BWS CLOSE

minDateTimeMethodCallExpr
  = "mindatetime"i OPEN BWS CLOSE

maxDateTimeMethodCallExpr
  = "maxdatetime"i OPEN BWS CLOSE

nowMethodCallExpr
  = "now"i OPEN BWS CLOSE

caseMethodCallExpr
  = "case"i OPEN BWS boolCommonExpr BWS COLON BWS commonExpr BWS (COMMA BWS boolCommonExpr BWS COLON BWS commonExpr BWS)* CLOSE

boolMethodCallExpr
  = endsWithMethodCallExpr
  / startsWithMethodCallExpr
  / containsMethodCallExpr
  / intersectsMethodCallExpr
  / hasSubsetMethodCallExpr
  / hasSubsequenceMethodCallExpr

optionallyQualifiedTypeName
  = singleQualifiedTypeName
  / "Collection"i OPEN singleQualifiedTypeName CLOSE
  / singleTypeName
  / "Collection"i OPEN singleTypeName CLOSE

listExpr
  = OPEN BWS primitiveLiteral BWS (COMMA BWS primitiveLiteral BWS)* CLOSE

HASH
  = "%23"

annotationQualifier
  = odataIdentifier

pct_encoded_no_SQUOTE
  = "%" ("0" / "1" / "3" / "4" / "5" / "6" / "8" / "9" / A_to_F) HEXDIG
  / "%" "2" ("0" / "1" / "2" / "3" / "4" / "5" / "6" / "8" / "9" / A_to_F)

pct_encoded_no_DQUOTE
  = "%" ("0" / "1" / "3" / "4" / "5" / "6" / "7" / "8" / "9" / A_to_F) HEXDIG
  / "%" "2" ("0" / "1" / "3" / "4" / "5" / "6" / "7" / "8" / "9" / A_to_F)

stringInUrl
  = quotation_mark charInJSON* quotation_mark

name_separator
  = BWS COLON BWS

directMemberExpr
  = propertyPathExpr
  / boundFunctionExpr
  / annotationExpr

implicitVariableExpr
  = "$it"i
  / "$this"i

lambdaVariableExpr
  = odataIdentifier

functionExprParameter
  = parameterName EQ (parameterAlias / parameterValue)

filterExpr
  = "/$filter"i OPEN boolCommonExpr CLOSE

anyExpr
  = "any"i OPEN BWS (lambdaVariableExpr BWS COLON BWS lambdaPredicateExpr)? BWS CLOSE

allExpr
  = "all"i OPEN BWS lambdaVariableExpr BWS COLON BWS lambdaPredicateExpr BWS CLOSE

boundFunctionExpr
  = functionExpr

annotationExpr
  = annotationInQuery (collectionPathExpr / singleNavigationExpr / complexPathExpr / primitivePathExpr)?

endsWithMethodCallExpr
  = "endswith"i OPEN BWS commonExpr BWS COMMA BWS commonExpr BWS CLOSE

startsWithMethodCallExpr
  = "startswith"i OPEN BWS commonExpr BWS COMMA BWS commonExpr BWS CLOSE

containsMethodCallExpr
  = "contains"i OPEN BWS commonExpr BWS COMMA BWS commonExpr BWS CLOSE

intersectsMethodCallExpr
  = "geo.intersects"i OPEN BWS commonExpr BWS COMMA BWS commonExpr BWS CLOSE

hasSubsetMethodCallExpr
  = "hassubset"i OPEN BWS commonExpr BWS COMMA BWS commonExpr BWS CLOSE

hasSubsequenceMethodCallExpr
  = "hassubsequence"i OPEN BWS commonExpr BWS COMMA BWS commonExpr BWS CLOSE

singleTypeName
  = entityTypeName
  / complexTypeName
  / typeDefinitionName
  / enumerationTypeName

charInJSON
  = qchar_unescaped
  / qchar_JSON_special
  / escape (quotation_mark / escape / ("/" / "%2F"i) / "b"i / "f"i / "n"i / "r"i / "t"i / "u"i HEXDIG|4|)

propertyPathExpr
  = (entityColNavigationProperty collectionNavigationExpr? / entityNavigationProperty singleNavigationExpr? / complexColProperty complexColPathExpr? / complexProperty complexPathExpr? / primitiveColProperty collectionPathExpr? / primitiveProperty primitivePathExpr? / streamProperty primitivePathExpr?)

lambdaPredicateExpr
  = boolCommonExpr

qchar_unescaped
  = unreserved
  / pct_encoded_unescaped
  / other_delims
  / ":"
  / "@"
  / "/"
  / "?"
  / "$"
  / "'"
  / "="

qchar_JSON_special
  = SP
  / ":"
  / "{"
  / "}"
  / "["
  / "]"

escape
  = "\\"
  / "%5C"i

pct_encoded_unescaped
  = "%" ("0" / "1" / "3" / "4" / "6" / "7" / "8" / "9" / A_to_F) HEXDIG
  / "%" "2" ("0" / "1" / "3" / "4" / "5" / "6" / "7" / "8" / "9" / A_to_F)
  / "%" "5" (DIGIT / "A"i / "B"i / "D"i / "E"i / "F"i)

