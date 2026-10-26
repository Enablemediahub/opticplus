package com.opticplus.bankalerts;

import java.math.BigDecimal;
import java.util.Locale;
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

    private BankSmsParser() {}

    static BankAlert parse(String sender, String body, long receivedAt) {
        if (sender == null || !"PRUDENTIAL".equalsIgnoreCase(sender.trim()) || body == null) {
            return null;
        }

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
