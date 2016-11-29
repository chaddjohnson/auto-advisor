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
    AAPL: {"emaLength":25,"emaChangeNegativeBuyThreshold":49,"emaChangePositiveBuyThreshold":1,"emaChangeNegativeSellThreshold":2,"targetIncrease":0.0006359},
    // BAC: {},
    FB: {"emaLength":8,"emaChangeNegativeBuyThreshold":35,"emaChangePositiveBuyThreshold":1,"emaChangeNegativeSellThreshold":8,"targetIncrease":0.0009914},
    AMZN: {"emaLength":22,"emaChangeNegativeBuyThreshold":46,"emaChangePositiveBuyThreshold":1,"emaChangeNegativeSellThreshold":4,"targetIncrease":0.0009596},
    MSFT: {"emaLength":13,"emaChangeNegativeBuyThreshold":25,"emaChangePositiveBuyThreshold":1,"emaChangeNegativeSellThreshold":4,"targetIncrease":0.000379},
    QQQ: {"emaLength":14,"emaChangeNegativeBuyThreshold":27,"emaChangePositiveBuyThreshold":1,"emaChangeNegativeSellThreshold":4,"targetIncrease":0.0007931}
};

/**
 * State
 */
var trader = null;
var tradeSignalers = [];
var stream = null;

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
        balance: trader.getBalance(),
        profit: trader.getProfit(),
        loss: trader.getLoss(),
        tradeCount: trader.getTradeCount()
    });

    process.exit();
});
