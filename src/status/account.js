var config = require('../../config.json');
var colors = require('colors');
var tradingClient = require('../../lib/tradingClients/base').factory('tradeking', config.brokerage);

function formatDollars(number) {
    return '$' + number.toFixed(2).replace(/(\d)(?=(\d\d\d)+(?!\d))/g, '$1,');
}

tradingClient.getAccount().then(function(accountData) {
    var gainLoss = accountData.marketValue - accountData.holdingCostBasis;
    var gainLossPercentage = (gainLoss / accountData.holdingCostBasis) * 100;

    console.log('Value:\t\t' + formatDollars(accountData.value));
    console.log('Investment:\t' + formatDollars(accountData.holdingCostBasis));

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
