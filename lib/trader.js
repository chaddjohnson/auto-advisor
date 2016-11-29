var moment = require('moment');
var _ = require('lodash');
var TradeSignaler = require('./tradeSignaler');

function Trader(tradeSignalers, initialBalance) {
    var self = this;

    self.constructor = Trader;

    self.tradeSignalers = {};
    self.position = null;
    self.commission = 4.95;
    self.balance = initialBalance;
    self.startingBalance = initialBalance;
    self.previousBalance = initialBalance;
    self.loss = 0;
    self.tradeCount = 0;

    // Map the array of trade signalers into an object.
    tradeSignalers.forEach(function(tradeSignaler) {
        self.tradeSignalers[tradeSignaler.getSymbol()] = tradeSignaler;
    });
}

Trader.prototype.getBalance = function() {
    return this.balance;
};

Trader.prototype.getProfit = function() {
    return this.balance - this.startingBalance;
};

Trader.prototype.getLoss = function() {
    return this.loss;
};

Trader.prototype.getTradeCount = function() {
    return this.tradeCount;
};

Trader.prototype.tick = function(tick) {
    var self = this;
    var tradeSignaler = self.tradeSignalers[tick.symbol];
    var signal = tradeSignaler && tradeSignaler.tick(tick);

    if (!tradeSignaler) {
        // A trade signaler doesn't exist for the symbol.
        return;
    }

    // Buy?
    if (signal === TradeSignaler.BUY && !self.position) {
        // TODO Instruct trading client to buy.

        // Track the new position.
        self.position = {
            symbol: tick.symbol,
            buyPrice: tick.askPrice,
            quantity: Math.floor(self.balance / tick.askPrice)
        };

        // Update the balance to account for the investment.
        self.balance -= (self.position.buyPrice * self.position.quantity) + self.commission;

        // Tell the signaler that trading is happening with the symbol its symbol.
        tradeSignaler.setIsTrading(true);

        console.log('BOUGHT ' + self.position.quantity + ' shares of ' + tick.symbol + ' at ' +  moment(tick.createdAt).format('YYYY-MM-DD HH:mm:ss') + ' for ' + ((self.position.quantity * self.position.buyPrice + self.commission)) + ' price ' + self.position.buyPrice + ' target ' + tradeSignaler.getTargetSellPrice());
    }

    // Sell?
    if (signal === TradeSignaler.SELL && self.position && self.position.symbol === tick.symbol) {
        // TODO Instruct trading client to sell.

        console.log('SOLD ' + self.position.quantity + ' shares of ' + tick.symbol + ' at ' +  moment(tick.createdAt).format('YYYY-MM-DD HH:mm:ss') + ' for ' + ((self.position.quantity * tick.bidPrice - self.commission)) + ' price ' + tick.bidPrice);
        console.log();

        self.balance += (tick.bidPrice * self.position.quantity) - self.commission;

        // Stop tracking a position.
        self.position = null;

        // Tell the signaler that trading is happening with the symbol its symbol.
        tradeSignaler.setIsTrading(false);

        // Was there a loss?
        if (self.balance < self.previousBalance) {
            // Track the loss.
            self.loss += self.previousBalance - self.balance;
        }

        // Track the balance for comparison with the next trade.
        self.previousBalance = self.balance;

        // Count the trade.
        self.tradeCount++;
    }
};

module.exports = Trader;
