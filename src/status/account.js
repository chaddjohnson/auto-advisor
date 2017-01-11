var config = require('../../config.json');
var _ = require('lodash');
var colors = require('colors');
var tradingClient = require('../../lib/tradingClients/base').factory('tradeking', config.brokerage);

function formatDollars(number) {
    return '$' + number.toFixed(2).replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
}

tradingClient.getAccount().then(function(accountData) {
    tradingClient.getHoldings().then(function(holdingsData) {
        var marketValue = 0;
        var costBasis = 0;

        _.each(holdingsData, function(holding) {
            marketValue += holding.marketValue;
            costBasis += holding.costBasis;
        });

        var gainLoss = marketValue - costBasis;
        var gainLossPercentage = (gainLoss / costBasis) * 100;

        console.log('Value:\t\t' + formatDollars(accountData.value));
        console.log('Investment:\t' + formatDollars(costBasis));

        if (gainLoss > 0) {
            console.log('Gain/loss:\t' + colors.green.bold(formatDollars(gainLoss) + ' (' + gainLossPercentage.toFixed(2) + '%)'));
        }
        else if (gainLoss < 0) {
            console.log('Gain/loss:\t' + colors.red.bold(formatDollars(gainLoss) + ' (' + gainLossPercentage.toFixed(2) + '%)'));
        }
        else {
            console.log('Gain/loss:\t' + colors.bold(formatDollars(gainLoss) + ' (' + gainLossPercentage.toFixed(2) + '%)'));
        }
    });
});
