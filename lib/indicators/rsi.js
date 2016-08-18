var Base = require('./base');
var _ = require('lodash');

function Rsi(inputs, outputMap) {
    this.constructor = Rsi;
    Base.call(this, inputs, outputMap);

    if (!inputs.length) {
        throw 'No length input parameter provided to study.';
    }

    this.previousAverageGain = null;
    this.previousAverageLoss = null;
}

// Create a copy of the Base "class" prototype for use in this "class."
Rsi.prototype = Object.create(Base.prototype);

Rsi.prototype.calculateInitialAverageGain = function(initialDataPoint, dataSegment) {
    var previousDataPoint = initialDataPoint;

    return _.reduce(dataSegment, function(memo, dataPoint) {
        var gain = dataPoint.close > previousDataPoint.close ? dataPoint.close - previousDataPoint.close : 0;

        previousDataPoint = dataPoint;

        return memo + gain;
    }, 0) / this.dataSegmentLength;
};

Rsi.prototype.calculateInitialAverageLoss = function(initialDataPoint, dataSegment) {
    var previousDataPoint = initialDataPoint;

    return _.reduce(dataSegment, function(memo, dataPoint) {
        var loss = dataPoint.close < previousDataPoint.close ? previousDataPoint.close - dataPoint.close : 0;

        previousDataPoint = dataPoint;

        return memo + loss;
    }, 0) / this.dataSegmentLength;
};

Rsi.prototype.tick = function() {
    var dataSegment = this.getDataSegment(this.getInput('length'));
    var previousDataPoint = this.getPrevious();
    var lastDataPoint = this.getLast();
    var averageGain = 0.0;
    var averageLoss = 0.0;
    var currentGain = 0.0;
    var currentLoss = 0.0;
    var RS = 0.0;
    var returnValue = {};

    this.dataSegmentLength = dataSegment.length;

    if (this.dataSegmentLength < this.getInput('length')) {
        return returnValue;
    }

    // Calculate the current gain and the current loss.
    currentGain = lastDataPoint.close > previousDataPoint.close ? lastDataPoint.close - previousDataPoint.close : 0;
    currentLoss = lastDataPoint.close < previousDataPoint.close ? previousDataPoint.close - lastDataPoint.close : 0;

    if (!this.previousAverageGain || !this.previousAverageLoss) {
        averageGain = this.previousAverageGain = this.calculateInitialAverageGain(lastDataPoint, dataSegment);
        averageLoss = this.previousAverageLoss = this.calculateInitialAverageLoss(lastDataPoint, dataSegment);
    }
    else {
        averageGain = this.previousAverageGain = ((this.previousAverageGain * (this.getInput('length') - 1)) + currentGain) / this.getInput('length');
        averageLoss = this.previousAverageLoss = ((this.previousAverageLoss * (this.getInput('length') - 1)) + currentLoss) / this.getInput('length');
    }

    RS = averageLoss > 0 ? averageGain / averageLoss : 0;

    returnValue[this.getOutputMapping('rsi')] = 100 - (100 / (1 + RS));

    return returnValue;
};

module.exports = Rsi;
