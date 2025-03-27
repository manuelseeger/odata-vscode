const parser = require('./parser.js');
const Tracer = require('pegjs-backtrace');


// Recursively remove null and undefined values
function cleanObject(obj) {
    if (Array.isArray(obj)) {
        return obj
            .map(item => cleanObject(item))
            .filter(item => item !== null && item !== undefined);
    } else if (obj !== null && typeof obj === 'object') {
        const cleaned = {};
        Object.keys(obj).forEach(key => {
            const value = cleanObject(obj[key]);
            if (value !== null && value !== undefined) {
                cleaned[key] = value;
            }
        });
        return cleaned;
    }
    return obj;
}

let input = "https://example.com/odata/Books?$filter=Price gt 20 and Author eq 'JohnDoe'&$select=Title/fsd,Author,Price&test=123";
//input = "https://example.com/odata/$batch";
//input = `https://analytics.dev.azure.com/swisslife/CTRM/_odata/v3.0/WorkItems?$filter=AssignedTo/Name eq 'Manuel Seeger' and State eq 'Approved'&$select=W`;
input = `https://analytics.dev.azure.com/swisslife/CTRM/_odata/v3.0/WorkItems?$filter=AssignedTo eq 'Manuel%20Seeger' and State eq 'Approved'&$select=AssignedTo/Name`;
input = "https://example.com/odata/Books?$select=Title/fsd,Author";
const tracer = new Tracer(input, {
    showTrace: true,
    matchesNode: function(node, options) { 
        return node.type === 'rule.match';
    }  ,
});

const mytracer = {
    trace: (event) => {
        if (event.type === 'rule.match') {
            console.log(`Matched: ${event.rule}`);
        }
    }
};
try {
    let result = parser.parse(input, {
        tracer: tracer
    });
        
    result = cleanObject(result);
    //const trace = tracer.getParseTree();
    //console.log(tracer.getParseTree())
    //console.log(tracer.getBacktraceString());
    console.log(tracer.getParseTreeString());
    console.log("Parsing Result:", JSON.stringify(result, null, 2)); // Pretty print the result
} catch (error) {
    console.log(tracer.getParseTreeString());
    //console.log(tracer.getBacktraceString());
    console.error(`Line: ${error.location.start.line}, column: ${error.location.start.column}\nParsing Error:`, error.message);
}