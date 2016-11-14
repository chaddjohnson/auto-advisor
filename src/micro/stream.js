'use strict';

// Config
var config = require('../../config');

// Libraries
var mongoose = require('mongoose');
var OAuth = require('oauth').OAuth;
var colors = require('colors');
var Quote = require('./quote');

// Settings
var symbols = ['AMZN','AAPL','FB','MSFT'];

var client = new OAuth(null, null, config.brokerage.consumerKey, config.brokerage.consumerSecret, '1.0', null, 'HMAC-SHA1');
var request = client.get('https://stream.tradeking.com/v1/market/quotes.json?symbols=' + symbols.join(','), config.brokerage.accessToken, config.brokerage.accessSecret);

mongoose.connect('mongodb://localhost/trading');
mongoose.connection.on('error', console.error.bind(console, 'Database connection error:'));

function stream() {
    request.on('response', function (response) {
        var chunk = '';
        var errorCount = 0;
        var lastQuotes = {};
        var lastTrades = {};

        response.setEncoding('utf8');

        response.on('data', function(data) {
            var jsonData = null;
            var quote = null;
            var trade = null;
            var newQuote = null;

            try {
                jsonData = JSON.parse(chunk + data);
                chunk = '';
                errorCount = 0;
            }
            catch (error) {
                chunk = data;
                errorCount++;

                if (errorCount >= 3) {
                    chunk = '';
                    errorCount = 0;
                }
            }

            quote = jsonData && jsonData.quote;
            trade = jsonData && jsonData.trade;

            if (!quote && !trade) {
                return;
            }

            if (quote && lastTrades[quote.symbol]) {
                newQuote = new Quote({
                    symbol: quote.symbol,
                    bidPrice: parseFloat(quote.bid),
                    askPrice: parseFloat(quote.ask),
                    lastPrice: parseFloat(lastTrades[quote.symbol].last),
                    timestamp: quote.timestamp,
                    tradeVolume: parseInt(lastTrades[quote.symbol].vl),
                    cumulativeVolume: parseInt(lastTrades[quote.symbol].cvol)
                });

                newQuote.save(function(error) {
                    if (error) {
                        console.error(error.toString().red);
                    }
                });

                console.log(JSON.stringify(newQuote.toJSON()));
            }

            if (quote) {
                lastQuotes[quote.symbol] = JSON.parse(JSON.stringify(quote));
            }
            if (trade) {
                lastTrades[trade.symbol] = JSON.parse(JSON.stringify(trade));
            }
        });
    });
    request.on('error', function(error) {
        console.error(error);
    });
    request.on('close', function() {
        console.error('Connection closed');

        // Restart streaming.
        setTimeout(stream, 1000);
    });
    request.end();
}

// Start streaming.
stream();
