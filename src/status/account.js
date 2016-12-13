var config = require('../../config.json');
var colors = require('colors');
var _ = require('lodash');
var tradingClient = require('../../lib/tradingClients/base').factory('tradeking', config.brokerage);

function formatDollars(number) {
    return '$' + number.toFixed(2).replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
}

tradingClient.getAccount().then(function(accountData) {
    var costBasis = 0;

    tradingClient.getHoldings().then(function(holdingsData) {
        _.each(holdingsData, function(holding) {
            costBasis += parseFloat(holding.costBasis);
        });

        var gainLoss = accountData.value - costBasis;
        var gainLossPercentage = (gainLoss / costBasis) * 100;

        console.log('Account Value:\t' + formatDollars(accountData.value));

        if (gainLoss > 0) {
            console.log('Gain/loss:\t' + colors.green(formatDollars(gainLoss)) + colors.green(' (' + gainLossPercentage.toFixed(2) + '%)'));
        }
        else if (gainLoss < 0) {
            console.log('Gain/loss:\t' + colors.red(formatDollars(gainLoss)) + colors.red(' (' + gainLossPercentage.toFixed(2) + '%)'));
        }
        else {
            console.log('Gain/loss:\t' + formatDollars(gainLoss) + ' (' + gainLossPercentage.toFixed(2) + '%)');
        }
    });
});
