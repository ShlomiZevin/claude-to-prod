// Reads an electricity bill image with OpenAI vision and returns its fields as JSON.
// The model must transcribe, never correct: fixing a wrong VAT line would hide the anomaly.

const MODEL = 'gpt-5.6-sol';

const num = { type: ['number', 'null'] };
const str = { type: ['string', 'null'] };

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'isElectricityBill', 'supplier', 'accountNumber', 'billNumber', 'issueDate',
    'periodStart', 'periodEnd', 'kwh', 'ratePerKwh', 'energyCharge', 'fixedCharge',
    'otherCharges', 'subtotal', 'vatRate', 'vat', 'total', 'currency', 'notes',
  ],
  properties: {
    isElectricityBill: { type: 'boolean' },
    supplier: str,
    accountNumber: str,
    billNumber: str,
    issueDate: { ...str, description: 'YYYY-MM-DD' },
    periodStart: { ...str, description: 'YYYY-MM-DD' },
    periodEnd: { ...str, description: 'YYYY-MM-DD' },
    kwh: { ...num, description: 'total consumption in the period, kWh' },
    ratePerKwh: { ...num, description: 'printed price per kWh before VAT, in the bill currency' },
    energyCharge: { ...num, description: 'the line charging for consumption, before VAT' },
    fixedCharge: { ...num, description: 'fixed / standing charge before VAT, 0 if printed as zero' },
    otherCharges: {
      type: 'array',
      description: 'every other line before VAT; discounts and credits are negative',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'amount'],
        properties: { label: { type: 'string' }, amount: { type: 'number' } },
      },
    },
    subtotal: { ...num, description: 'total before VAT as printed' },
    vatRate: { ...num, description: 'as a fraction, e.g. 0.18 for 18%' },
    vat: { ...num, description: 'VAT amount as printed' },
    total: { ...num, description: 'amount to pay as printed' },
    currency: { ...str, description: 'ISO code, e.g. ILS' },
    notes: { ...str, description: 'anything unreadable or ambiguous, in English' },
  },
};

const INSTRUCTIONS = `You read Israeli electricity bills (Hebrew, right-to-left) from photos or scans.
Transcribe the values exactly as printed. Never correct, recompute or "fix" a number, even if the
arithmetic on the bill looks wrong: the app detects billing errors, so a corrected value hides them.
Rules:
- Dates as YYYY-MM-DD (Israeli bills print DD/MM/YYYY).
- Amounts as plain numbers without the ₪ sign. Discounts and credits are negative.
- Put every charge line before VAT that is not the consumption line or the fixed charge into otherCharges.
- Use null for anything not printed or not readable, and explain it in notes.
- If the image is not an electricity bill, set isElectricityBill to false and everything else to null / [].`;

export async function extractBill({ dataBase64, mimeType }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_completion_tokens: 4000,   // max_tokens is rejected by this model family
      response_format: { type: 'json_schema', json_schema: { name: 'electricity_bill', strict: true, schema: SCHEMA } },
      messages: [
        { role: 'system', content: INSTRUCTIONS },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract this bill.' },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${dataBase64}`, detail: 'high' } },
          ],
        },
      ],
    }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${json.error?.message || 'request failed'}`);
  const choice = json.choices[0];
  if (choice.message.refusal) throw new Error(`model refused: ${choice.message.refusal}`);
  return { bill: JSON.parse(choice.message.content), usage: json.usage, model: json.model };
}
