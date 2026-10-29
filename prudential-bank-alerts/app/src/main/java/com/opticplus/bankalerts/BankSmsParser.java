package com.opticplus.bankalerts;

import java.math.BigDecimal;
import java.util.Locale;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class BankSmsParser {
    private static final Pattern MOVEMENT = Pattern.compile(
            "(?i)\\b(credited|debited)\\s+with\\s+GHS\\s*([0-9,]+(?:\\.\\d{1,2})?)"
    );
    private static final Pattern ACCOUNT = Pattern.compile(
            "(?i)\\baccount\\s+([0-9x*]+)"
    );
    private static final Pattern TRANSACTION_DATE = Pattern.compile(
            "(?i)\\bon\\s+(\\d{2}-\\d{2}-\\d{4})"
    );
    private static final Pattern AVAILABLE_BALANCE = Pattern.compile(
            "(?i)\\bAvailable\\s+Balance\\s+is\\s+GHS\\s*([0-9,]+(?:\\.\\d{1,2})?)"
    );
    private static final Pattern REFERENCE = Pattern.compile(
            "\\(([^()\\s]{4,80})\\)\\s*\\.?\\s*(?=Available\\s+Balance)"
    );
    private static final Pattern MTN_PAYMENT = Pattern.compile(
            "(?is)\\bPayment\\s+(received for|made for)\\s+GHS\\s*([0-9,]+(?:\\.\\d{1,2})?)"
    );
    private static final Pattern MTN_CASH_OUT = Pattern.compile(
            "(?is)\\bCash\\s+Out\\s+made for\\s+GHS\\s*([0-9,]+(?:\\.\\d{1,2})?)"
    );
    private static final Pattern MTN_CURRENT_BALANCE = Pattern.compile(
            "(?i)\\bCurrent\\s+Balance:\\s*GHS\\s*([0-9,]+(?:\\.\\d{1,2})?)"
    );
    private static final Pattern MTN_AVAILABLE_BALANCE = Pattern.compile(
            "(?i)\\bAvailable\\s+Balance:\\s*GHS\\s*([0-9,]+(?:\\.\\d{1,2})?)"
    );
    private static final Pattern MTN_TRANSACTION_ID = Pattern.compile(
            "(?i)\\b(?:Transaction ID|Financial Transaction Id):\\s*([A-Za-z0-9_-]{4,80})"
    );

    private BankSmsParser() {}

    static BankAlert parse(String sender, String body, long receivedAt) {
        if (sender == null || body == null) {
            return null;
        }

        if ("PRUDENTIAL".equalsIgnoreCase(sender.trim())) {
            return parsePrudential(body, receivedAt);
        }

        String normalizedSender = sender.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (!(normalizedSender.startsWith("MTN") || normalizedSender.equals("170") || normalizedSender.equals("MOBILEMONEY"))) {
            return null;
        }
        Matcher payment = MTN_PAYMENT.matcher(body);
        Matcher cashOut = MTN_CASH_OUT.matcher(body);
        boolean isCashOut = cashOut.find();
        boolean isPayment = !isCashOut && payment.find();
        if (!isCashOut && !isPayment) {
            return null;
        }
        Matcher currentBalanceMatcher = MTN_CURRENT_BALANCE.matcher(body);
        Matcher availableBalanceMatcher = MTN_AVAILABLE_BALANCE.matcher(body);
        Matcher transactionIdMatcher = MTN_TRANSACTION_ID.matcher(body);
        if (!currentBalanceMatcher.find() || !transactionIdMatcher.find()) {
            return null;
        }
        String amount = normalizeAmount(isCashOut ? cashOut.group(1) : payment.group(2));
        String currentBalance = normalizeAmount(currentBalanceMatcher.group(1));
        String availableBalance = availableBalanceMatcher.find()
                ? normalizeAmount(availableBalanceMatcher.group(1))
                : currentBalance;
        if (amount == null || availableBalance == null) return null;
        String direction = isCashOut || "made for".equalsIgnoreCase(payment.group(1))
                ? "debited" : "credited";
        String transactionDate = new SimpleDateFormat("dd-MM-yyyy", Locale.US).format(new Date(receivedAt));
        return new BankAlert(
                "MTN_MOMO",
                direction,
                amount,
                "0000",
                transactionIdMatcher.group(1),
                transactionDate,
                availableBalance,
                receivedAt
        );
    }

    private static BankAlert parsePrudential(String body, long receivedAt) {

        Matcher movement = MOVEMENT.matcher(body);
        Matcher account = ACCOUNT.matcher(body);
        Matcher date = TRANSACTION_DATE.matcher(body);
        Matcher balance = AVAILABLE_BALANCE.matcher(body);
        Matcher reference = REFERENCE.matcher(body);
        if (!movement.find() || !account.find() || !date.find() || !balance.find() || !reference.find()) {
            return null;
        }

        String amount = normalizeAmount(movement.group(2));
        String availableBalance = normalizeAmount(balance.group(1));
        String direction = movement.group(1).toLowerCase(Locale.ROOT);
        String accountSuffix = lastFourDigits(account.group(1));
        if (amount == null || availableBalance == null || accountSuffix.length() != 4) {
            return null;
        }

        return new BankAlert(
                "PRUDENTIAL",
                direction,
                amount,
                accountSuffix,
                reference.group(1),
                date.group(1),
                availableBalance,
                receivedAt
        );
    }

    private static String normalizeAmount(String value) {
        try {
            return new BigDecimal(value.replace(",", "")).setScale(2).toPlainString();
        } catch (NumberFormatException exception) {
            return null;
        }
    }

    private static String lastFourDigits(String account) {
        StringBuilder digits = new StringBuilder();
        for (int index = account.length() - 1; index >= 0 && digits.length() < 4; index--) {
            char character = account.charAt(index);
            if (Character.isDigit(character)) {
                digits.append(character);
            } else if (digits.length() > 0) {
                break;
            }
        }
        return digits.reverse().toString();
    }
}
