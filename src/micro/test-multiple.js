'use strict';

/**
 * Libraries
 */
var mongoose = require('mongoose');
var colors = require('colors');
var Trader = require('../../lib/trader');
var TradeSignaler = require('../../lib/tradeSignaler');
var Tick = require('../../lib/models/tick');

/**
 * Parameters
 */
var argv = require('yargs').argv;
var investment = parseFloat(argv.investment);

if (!investment) {
    console.error(colors.red('No investment provided.'));
    process.exit(1);
}

/**
 * Settings
 */
var symbols = ['AAPL','BAC','FB','AMZN','MSFT','QQQ'];
var phenotypes = {
    AAPL: {"emaLength":8,"emaChangeNegativeBuyThreshold":22,"emaChangePositiveBuyThreshold":1,"emaChangeNegativeSellThreshold":4,"targetIncrease":0.0005658,"stopLossThreshold":0.43144},
    BAC: {"emaLength":21,"emaChangeNegativeBuyThreshold":31,"emaChangePositiveBuyThreshold":1,"emaChangeNegativeSellThreshold":1,"targetIncrease":0.0008936,"stopLossThreshold":0.23103},
    FB: {"emaLength":2,"emaChangeNegativeBuyThreshold":15,"emaChangePositiveBuyThreshold":1,"emaChangeNegativeSellThreshold":10,"targetIncrease":0.0009026,"stopLossThreshold":0.3316},
    AMZN: {"emaLength":4,"emaChangeNegativeBuyThreshold":15,"emaChangePositiveBuyThreshold":1,"emaChangeNegativeSellThreshold":6,"targetIncrease":0.000994,"stopLossThreshold":0.38285},
    MSFT: {"emaLength":18,"emaChangeNegativeBuyThreshold":34,"emaChangePositiveBuyThreshold":1,"emaChangeNegativeSellThreshold":3,"targetIncrease":0.0004346,"stopLossThreshold":0.48618},
    QQQ: {"emaLength":16,"emaChangeNegativeBuyThreshold":42,"emaChangePositiveBuyThreshold":1,"emaChangeNegativeSellThreshold":1,"targetIncrease":0.0006283,"stopLossThreshold":0.25081}
};

/**
 * State
 */
var trader = null;
var tradeSignalers = [];

// Connect to the database.
mongoose.connect('mongodb://localhost/trading');
mongoose.connection.on('error', function(error) {
    console.error(colors.red('Database connection error: ' + error));
});

// Set up trade signalers.
symbols.forEach(function(symbol) {
    if (!phenotypes[symbol]) {
        return;
    }

    // Instantiate a new signaler for the symbol.
    tradeSignalers.push(new TradeSignaler(symbol, phenotypes[symbol]));
});

// Set up the trader.
trader = new Trader(tradeSignalers, investment);

// Load tick data for all symbols.
Tick.find({symbol: {$in: symbols}}).sort({createdAt: 1}).exec(function(error, ticks) {
    if (error) {
        return console.error(colors.red(error));
    }

    // Iterate through tick data.
    ticks.forEach(function(tick) {
        // Tick the trader.
        trader.tick(tick);
    });

    console.log({
        startingBalance: trader.getStartingBalance(),
        balance: trader.getBalance(),
        profit: trader.getProfit(),
        loss: trader.getLoss(),
        tradeCount: trader.getTradeCount()
    });

    process.exit();
});
