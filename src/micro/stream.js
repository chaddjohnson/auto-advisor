'use strict';

// Config
var config = require('../../config');

// Libraries
var mongoose = require('mongoose');
var OAuth = require('oauth').OAuth;
var colors = require('colors');
var Quote = require('./quoteModel');

// Settings
var symbols = ['AMZN','AAPL','FB','MSFT','QQQ'];

var client = new OAuth(null, null, config.brokerage.consumerKey, config.brokerage.consumerSecret, '1.0', null, 'HMAC-SHA1');

mongoose.connect('mongodb://localhost/trading');
mongoose.connection.on('error', console.error.bind(console, 'Database connection error:'));

function stream() {
    var request = client.get('https://stream.tradeking.com/v1/market/quotes.json?symbols=' + symbols.join(','), config.brokerage.accessToken, config.brokerage.accessSecret);

    request.on('response', function (response) {
        var chunk = '';
        var chunkCount = 0;
        var lastQuotes = {};
        var lastTrades = {};

        response.setEncoding('utf8');

        response.on('data', function(data) {
            var jsonData = null;
            var quote = null;
            var trade = null;
            var newQuoteData = null;
            var symbol;

            try {
                jsonData = JSON.parse(chunk + data);
                chunk = '';
                chunkCount = 0;
            }
            catch (error) {
                if (chunkCount >= 3) {
                    chunk = '';
                    chunkCount = 0;
                }

                chunk += data;
                chunkCount++;

                return;
            }

            quote = jsonData && jsonData.quote;
            trade = jsonData && jsonData.trade;

            if (!quote && !trade) {
                return;
            }

            symbol = (quote && quote.symbol) || (trade && trade.symbol);

            if (quote) {
                lastQuotes[symbol] = JSON.parse(JSON.stringify(quote));
            }
            if (trade) {
                lastTrades[symbol] = JSON.parse(JSON.stringify(trade));
            }

            if (!lastQuotes[symbol] || !lastTrades[symbol]) {
                return;
            }

            newQuoteData = {
                symbol: symbol,
                bidPrice: parseFloat(lastQuotes[symbol].bid),
                askPrice: parseFloat(lastQuotes[symbol].ask),
                lastPrice: parseFloat(lastTrades[symbol].last),
                timestamp: lastQuotes[symbol].timestamp,
                tradeVolume: parseInt(lastTrades[symbol].vl),
                cumulativeVolume: parseInt(lastTrades[symbol].cvol)
            };
            Quote.create(newQuoteData, function(error) {
                if (error) {
                    console.error(error.toString().red);
                }
            });

            console.log(JSON.stringify(newQuoteData));
        });
    });
    request.on('error', function(error) {
        console.error(error);
    });
    request.on('close', function() {
        console.error('Connection closed');

        // Restart streaming.
        setTimeout(stream, 500);
    });
    request.end();
}

// Start streaming.
stream();
