'use strict';

if (process.argv.length < 3) {
    console.error('No symbol provided');
    process.exit(1);
}

// Libraries
var fs = require('fs');
var request = require('request');
var async = require('async');
var cheerio = require('cheerio');
var _ = require('lodash');

// State
var symbol = process.argv[2];
var earningsDates = [];
var newsArticleUrl = '';
var releasedInMorning = false;
var quotes = [];
var results = [];

// Synchronous tasks.
var tasks = [];

// Download earnings history and get earnings dates and article URL.
tasks.push(function(taskCallback) {
    var options = {
        url: 'http://www.streetinsider.com/ec_earnings.php',
        qs: {q: symbol},
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36'
        }
    };
    request(options, function(error, response, body) {
        if (error) {
            return taskCallback(error.message || error);
        }

        var $ = cheerio.load(body.toString());

        // Go through each earning history.
        $('.earning_history .is_hilite, .earning_history .LiteHover').each(function(index) {
            // Only worry about the last several earnings reports.
            if (earningsDates.length >= 8) {
                return;
            }

            var date = $(this).find('td').eq(0).text().trim();

            // Reformat the date.
            date = date.replace(/(\d+)\/(\d+)\/(\d+)/g, '20$3-$1-$2');
            date = date.replace(/\-([0-9])(\-|$)/g, '-0$1$2');
            date = date.replace(/\-([0-9])(\-|$)/g, '-0$1$2');

            if (new Date(date) >= new Date()) {
                // Skip the date if it's today or in the future.
                return;
            }

            earningsDates.push(date);

            if (!newsArticleUrl) {
                newsArticleUrl = $(this).find('td').last().find('a').attr('href');
            }
        });

        taskCallback();
    });
});

// Determine whether earnings are released in the morning or evening.
tasks.push(function(taskCallback) {
    var options = {
        url: newsArticleUrl,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36'
        }
    };
    request(options, function(error, response, body) {
        if (error) {
            return taskCallback(error.message || error);
        }

        var $ = cheerio.load(body.toString());
        var timestamp = $('.timestamp').text();

        releasedInMorning = timestamp.indexOf('AM') > -1;

        if (releasedInMorning) {
            return taskCallback('Skipping ' + symbol + ' as earnings are released in morning.');
        }

        taskCallback();
    });
});

// Download quotes.
tasks.push(function(taskCallback) {
    var options = {
        url: 'http://real-chart.finance.yahoo.com/table.csv?s=' + symbol + '&a=0&b=01&c=2014&d=07&e=21&f=2016&g=d&ignore=.csv',
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36'
        }
    };
    request(options, function(error, response, body) {
        if (error) {
            return taskCallback(error);
        }

        var lines = body.toString().split('\n');

        if (lines[0] !== 'Date,Open,High,Low,Close,Volume,Adj Close') {
            return taskCallback('Bad quote data.');
        }

        // Remove the header.
        lines.shift();

        lines.forEach(function(line) {
            if (line.length === 0) {
                return;
            }

            var lineParts = line.split(',');

            quotes.push({
                date: lineParts[0],
                open: parseFloat(lineParts[1]),
                high: parseFloat(lineParts[2]),
                low: parseFloat(lineParts[3]),
                close: parseFloat(lineParts[4])
            });
        });

        taskCallback();
    });
});

// Analyze.
tasks.push(function(taskCallback) {
    var error = null;

    // console.log('DATE\t\tMORNING %\tHIGH %\tCLOSE %');
    // console.log('==========\t=========\t======\t=======');

    earningsDates.forEach(function(earningsDate, earningsIndex) {
        var quoteIndex = 0;
        var quote = _.find(quotes, function(item, index) {
            if (item.date === earningsDate) {
                quoteIndex = index;
                return true;
            }
        });
        var previousQuote = null;

        previousQuote = quotes[quoteIndex + 1];

        // Calculate results.
        try {
            var result = {
                morningChange: ((quote.open / previousQuote.close) - 1) * 100,
                highChange: ((quote.high / previousQuote.close) - 1) * 100,
                dayChange: ((quote.close / previousQuote.close) - 1) * 100
            };
            results.push(result);

            // console.log(earningsDate + '\t' + result.morningChange.toFixed(2) + '\t\t' + result.highChange.toFixed(2) + '\t' + result.dayChange.toFixed(2));
        }
        catch (error) {
            error = 'Error using quote.';
            return;
        }
    });

    taskCallback(error);
});

// Execute tasks.
async.series(tasks, function(error) {
    if (error) {
        return;
    }

    var morningChangeAverage = _.reduce(results, function(memo, item) {
        return memo + item.morningChange;
    }, 0) / results.length;

    var highChangeAverage = _.reduce(results, function(memo, item) {
        return memo + item.highChange;
    }, 0) / results.length;

    var dayChangeAverage = _.reduce(results, function(memo, item) {
        return memo + item.dayChange;
    }, 0) / results.length;

    var morningWins = 0;
    var highWins = 0;
    var dayWins = 0;

    results.forEach(function(result) {
        if (result.morningChange >= 0) {
            morningWins++;
        }
        if (result.highChange >= 0) {
            highWins++;
        }
        if (result.dayChange >= 0) {
            dayWins++;
        }
    });

    var morningWinRate = (morningWins / results.length) * 100;
    var highWinRate = (highWins / results.length) * 100;
    var dayWinRate = (dayWins / results.length) * 100;

    // Display results.
    // console.log('\nSYMBOL\tMORNING %\tHIGH %\t\tCLOSE %\t\tMORNING #\tHIGH #\t\tCLOSE #\t\tRESULTS');
    // console.log('======\t=========\t======\t\t=======\t\t=========\t======\t\t=======\t\t=======');
    console.log(symbol + '\t' + morningChangeAverage.toFixed(2) + '\t\t' + highChangeAverage.toFixed(2) + '\t\t' + dayChangeAverage.toFixed(2) + '\t\t' + morningWinRate.toFixed(2) + '\t\t' + highWinRate.toFixed(2) + '\t\t' + dayWinRate.toFixed(2) + '\t\t' + results.length);
});
