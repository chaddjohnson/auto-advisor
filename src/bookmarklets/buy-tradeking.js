(function() {
    var symbol, commission, buyingPower, defaultInvestment, amount, askPrice, shares, lastAskPrice;

    // Clear timeouts to reset things.
    if (window.bookmarkletQuoteTimeout) {
        window.clearTimeout(window.bookmarkletQuoteTimeout);
    }
    if (window.bookmarkletUpdateTimeout) {
        window.clearTimeout(window.bookmarkletUpdateTimeout);
    }

    commission = 4.95;
    symbol = prompt('Symbol');

    // Find the day trading buying power.
    buyingPower = parseFloat(jQuery('#balanceTable tbody tr:nth-child(1) .BalDataRowCash').text().replace(/[\$\,]/g, ''));
    defaultInvestment = 10000;

    // Do not let the investment exceed the buying power.
    if (defaultInvestment > buyingPower) {
        defaultInvestment = buyingPower - commission;
    }

    // Round to two decimals.
    defaultInvestment = parseFloat(defaultInvestment.toFixed(2));

    // Ask for the amount to trade, defaulting to the buying power.
    amount = prompt('Amount', defaultInvestment).replace(/[\$\,]/g, '');

    // Select "Buy".
    jQuery('#transaction_1').click();

    // Select "Market".
    jQuery('#ordType_1').click();

    window.setTimeout(function() {
        // Enter the symbol.
        jQuery('#symbol').focus();
        jQuery('#symbol').val(symbol);
        jQuery('#symbol').blur();

        updateShares();
    }, 100);

    function updateShares() {
        // Click the Refresh button.
        jQuery('#refreshButton').click();

        // Wait for the response.
        window.bookmarkletQuoteTimeout = window.setTimeout(function() {
            // Find the ask price.
            askPrice = parseFloat(jQuery('#quotePanelAsk0').text());

            if (askPrice !== lastAskPrice) {
                // Calculate the number of shares that can be purchased using the amount.
                shares = Math.floor((amount - commission) / askPrice);

                // Enter the number of shares.
                if (shares && shares !== Infinity) {
                    jQuery('#amount').val(shares);
                }
                else {
                    jQuery('#amount').val('');
                }
            }

            lastAskPrice = askPrice;

            window.bookmarkletUpdateTimeout = window.setTimeout(updateShares, 1000);
        }, 500);
    }
})();
