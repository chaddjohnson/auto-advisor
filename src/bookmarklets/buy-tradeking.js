(function() {
    var symbol, commission, buyingPower, amount, askPrice, shares, lastAskPrice;

    commission = 4.95;
    symbol = jQuery('#symbol').val() || prompt('Symbol');

    // Find the day trading buying power.
    buyingPower = parseFloat(jQuery('#balanceTable tbody tr:nth-child(1) .BalDataRowCash').text().replace(/[\$\,]/g, ''));

    // Ask for the amount to trade, defaulting to the buying power.
    amount = window.bookmarkletAmount || prompt('Amount', buyingPower).replace(/[\$\,]/g, '');

    // Track the amount globally.
    window.bookmarkletAmount = amount;

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
        window.setTimeout(function() {
            // Find the ask price.
            askPrice = parseFloat(jQuery('#quotePanelAsk0').text());

            if (askPrice !== lastAskPrice) {
                // Calculate the number of shares that can be purchased using the amount.
                shares = Math.floor((amount - commission) / askPrice);

                // Enter the number of shares.
                if (shares && shares !== Infinity) {
                    jQuery('#amount').val(shares);
                }
            }

            lastAskPrice = askPrice;

            window.setTimeout(updateShares, 1000);
        }, 500);
    }
})();
