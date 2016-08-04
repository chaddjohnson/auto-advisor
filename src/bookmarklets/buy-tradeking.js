(function() {
    var symbol, commission, buyingPower, amount, askPrice, shares;

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

    // Enter the symbol.
    window.setTimeout(function() {
        jQuery('#symbol').focus();
        jQuery('#symbol').val(symbol);
        jQuery('#symbol').blur();
    }, 100);

    window.setTimeout(function() {
        // Find the ask price.
        askPrice = parseFloat(jQuery('#quotePanelAsk0').text());

        // Calculate the number of shares that can be purchased using the amount.
        shares = Math.floor((amount - commission) / askPrice);

        // Enter the number of shares.
        jQuery('#amount').val(shares);
    }, 1000);
})();
