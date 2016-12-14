var Base = require('./base');
var _ = require('lodash');

function Ema(inputs, outputMap) {
    this.constructor = Ema;
    Base.call(this, inputs, outputMap);

    if (!inputs.length) {
        throw 'No length input parameter provided to study.';
    }

    this.tickCount = 0;
}

// Create a copy of the Base "class" prototype for use in this "class."
Ema.prototype = Object.create(Base.prototype);

Ema.prototype.tick = function() {
    var lastTick = this.getLast();
    var dataSegment = [];
    var K = 0.0;
    var ema = 0.0;
    var returnValue = {};

    this.tickCount++;

    if (this.tickCount < this.getInput('length')) {
        return returnValue;
    }

    if (!this.previousEma) {
        dataSegment = this.getDataSegment(this.getInput('length'));

        // Use an SMA for the first EMA value
        ema = _.reduce(dataSegment, function(memo, tick) {
            return memo + tick.close;
        }, 0) / this.getInput('length');
    }
    else {
        K = 2 / (1 + this.getInput('length'));
        ema = (lastTick.close * K) + (this.previousEma * (1 - K));
    }

    // Set the new EMA just calculated as the previous EMA.
    this.previousEma = ema;

    returnValue[this.getOutputMapping('ema')] = ema;

    return returnValue;
};

module.exports = Ema;
