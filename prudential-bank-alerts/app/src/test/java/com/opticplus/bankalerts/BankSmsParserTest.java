package com.opticplus.bankalerts;

import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

public final class BankSmsParserTest {
    private static final String CREDIT_ALERT =
            "Your account 005xxxxxx0017 has been credited with GHS4,900.00 - " +
                    "300317~ GIP Trsf B/O BEALET OPTICAL CENTRE LIMITED,0052504760017," +
                    "Bealet optical sales~ 3003170000000000  30059100  092244488318 " +
                    "on 26-10-2026 (939825934). Available Balance is GHS41,177.14. " +
                    "Protect your login credentials by never sharing your password or PIN.";

    @Test
    public void parsesPrudentialCreditWithoutRetainingFullAccountNumber() {
        BankAlert alert = BankSmsParser.parse("PRUDENTIAL", CREDIT_ALERT, 1234L);

        assertEquals("credited", alert.direction);
        assertEquals("4900.00", alert.amount);
        assertEquals("0017", alert.accountSuffix);
        assertEquals("939825934", alert.transactionReference);
        assertEquals("26-10-2026", alert.transactionDate);
        assertEquals("41177.14", alert.availableBalance);
        assertEquals(1234L, alert.receivedAt);
    }

    @Test
    public void ignoresUnapprovedSenderAndIncompleteAlert() {
        assertNull(BankSmsParser.parse("OTHERBANK", CREDIT_ALERT, 1234L));
        assertNull(BankSmsParser.parse("PRUDENTIAL", "Your account was credited.", 1234L));
    }

    @Test
    public void parsesPrudentialDebitAlert() {
        String debitAlert =
                "Your account 005xxxxxx0017 has been debited with GHS15.00 - " +
                        "2026 October Digital Bundle Charge on 20-10-2026 (938903154). " +
                        "Available Balance is GHS36,277.14. " +
                        "Protect your login credentials by never sharing your password or PIN.";

        BankAlert alert = BankSmsParser.parse("PRUDENTIAL", debitAlert, 5678L);

        assertEquals("debited", alert.direction);
        assertEquals("15.00", alert.amount);
        assertEquals("0017", alert.accountSuffix);
        assertEquals("938903154", alert.transactionReference);
        assertEquals("20-10-2026", alert.transactionDate);
        assertEquals("36277.14", alert.availableBalance);
    }
}
