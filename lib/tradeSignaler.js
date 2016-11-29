var EmaIndicator = require('./indicators/ema');

function TradeSignaler(symbol, phenotype) {
    this.constructor = TradeSignaler;

    this.symbol = symbol;
    this.phenotype = phenotype;
    this.ticks = [];

    this.emaIndicator = new EmaIndicator({length: phenotype.emaLength}, {ema: 'ema'});
    this.previousEma = 0;
    this.emaChangeNegativeCount = 0;
    this.emaChangePositiveCount = 0;
    this.recentEmaChangeNegativeCount = 0;
    this.targetSellPrice = 0;
    this.isTrading = false;
}

TradeSignaler.NONE = 0;
TradeSignaler.BUY = 1;
TradeSignaler.SELL = 2;

TradeSignaler.prototype.getSymbol = function() {
    return this.symbol;
};

TradeSignaler.prototype.getTargetSellPrice = function() {
    return this.targetSellPrice;
};

TradeSignaler.prototype.setIsTrading = function(isTrading) {
    this.isTrading = isTrading;
}

TradeSignaler.prototype.tick = function(tick) {
    var self = this;
    var signal = TradeSignaler.NONE;
    var justSignaled = false;
    var ema = 0;
    var emaChange = 0;
    var isDayEnd = new Date(tick.createdAt).getHours() === 14 && new Date(tick.createdAt).getMinutes() >= 58;

    // Make sure the tick's symbol matches the symbol being monitored.
    if (tick.symbol !== self.symbol) {
        return signal;
    }

    // Track the tick.
    self.ticks.push(tick);

    self.emaIndicator.setData(self.ticks);
    ema = self.emaIndicator.tick().ema;

    if (!self.previousEma) {
        self.previousEma = ema;
        return;
    }

    // Calculate the EMA change from the last tick.
    emaChange = ema - self.previousEma;

    // React based on the EMA change.
    if (emaChange < 0) {
        self.emaChangeNegativeCount++;
        self.emaChangePositiveCount = 0;
    }
    else {
        self.recentEmaChangeNegativeCount = self.emaChangeNegativeCount;
        self.emaChangeNegativeCount = 0;
        self.emaChangePositiveCount++;
    }

    // Signal a buy if >= n EMA change negatives followed by m change positives.
    if (!self.isTrading && self.recentEmaChangeNegativeCount >= self.phenotype.emaChangeNegativeBuyThreshold && self.emaChangePositiveCount >= self.phenotype.emaChangePositiveBuyThreshold) {
        self.targetSellPrice = tick.askPrice * (1 + self.phenotype.targetIncrease);
        justSignaled = true;
        signal = TradeSignaler.BUY;
    }

    // Sell if didn't just buy and tick bid price exceeds target price.
    if (self.isTrading && !justSignaled && ((self.targetSellPrice && tick.bidPrice >= self.targetSellPrice) || isDayEnd)) {
        self.targetSellPrice = 0;
        signal = TradeSignaler.SELL;
    }

    // Track the current EMA for next time.
    self.previousEma = ema;

    return signal;
};

module.exports = TradeSignaler;
