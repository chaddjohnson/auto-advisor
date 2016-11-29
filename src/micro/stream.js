'use strict';

// Config
var config = require('../../config.json');

// Libraries
var mongoose = require('mongoose');
var OAuth = require('oauth').OAuth;
var _ = require('lodash');
var Tick = require('../../lib/models/tick');

// Settings
var symbols = ['AAPL','AMZN','BAC','FB','MSFT','QQQ'];

mongoose.connect('mongodb://localhost/trading');
mongoose.connection.on('error', console.error.bind(console, 'Database connection error:'));

startStreaming();

function startStreaming() {
    // Set up the trading client.
    var tradingClient = require('../../lib/tradingClients/base').factory('tradeking', config.brokerage);

    // Stream data.
    var stream = tradingClient.stream(symbols);

    stream.on('rawData', function(data) {
        // Stop streaming when the market closes.
        if (new Date().getHours() >= 15) {
            process.exit();
        }
        console.log(data);
    });
    stream.on('data', function(data) {
        Tick.create(data);
    });
    stream.on('close', function() {
        setTimeout(function() {
            // Restart streaming.
            startStreaming();
        }, 5000);
    });
}
