var request = require('request');
var fs = require('fs');

var symbol = process.argv[2];
var url = 'http://real-chart.finance.yahoo.com/table.csv?s=' + symbol + '&a=0&b=1&c=2014&d=11&e=31&f=2016&g=d&ignore=.csv';
var quotes = [];

request.get(url, function(error, response, body) {
    var lines = body.toString().trim().split('\n');

    // Remove headers.
    lines.shift();

    lines.reverse();

    lines.forEach(function(line) {
        var lineParts = line.split(',');
        var quote = {};

        quote.date = lineParts[0];
        quote.high = parseFloat(lineParts[2]);
        quote.close = parseFloat(lineParts[6]);

        quotes.push(quote);
    });

    console.log(JSON.stringify(quotes));
});
