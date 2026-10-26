package com.opticplus.bankalerts;

final class BankAlert {
    final String sender;
    final String direction;
    final String amount;
    final String accountSuffix;
    final String transactionReference;
    final String transactionDate;
    final String availableBalance;
    final long receivedAt;

    BankAlert(
            String sender,
            String direction,
            String amount,
            String accountSuffix,
            String transactionReference,
            String transactionDate,
            String availableBalance,
            long receivedAt
    ) {
        this.sender = sender;
        this.direction = direction;
        this.amount = amount;
        this.accountSuffix = accountSuffix;
        this.transactionReference = transactionReference;
        this.transactionDate = transactionDate;
        this.availableBalance = availableBalance;
        this.receivedAt = receivedAt;
    }
}
