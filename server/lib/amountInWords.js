"use strict";

const ONES = [
  "",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

const SCALES = ["", "thousand", "million", "billion"];

function chunkToWords(n) {
  const parts = [];
  const hundreds = Math.floor(n / 100);
  const remainder = n % 100;

  if (hundreds) {
    parts.push(`${ONES[hundreds]} hundred`);
  }

  if (remainder) {
    if (hundreds) parts.push("and");
    if (remainder < 20) {
      parts.push(ONES[remainder]);
    } else {
      const tens = Math.floor(remainder / 10);
      const ones = remainder % 10;
      parts.push(ones ? `${TENS[tens]} ${ONES[ones]}` : TENS[tens]);
    }
  }

  return parts.join(" ");
}

function toTitleCase(text) {
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
}

function amountInWords(amount) {
  const n = Math.floor(Number(amount));
  if (!Number.isFinite(n) || n < 0) return "";
  if (n === 0) return "Zero Only";

  const parts = [];
  let remaining = n;
  let scaleIndex = 0;

  while (remaining > 0) {
    const chunk = remaining % 1000;
    if (chunk) {
      const chunkWords = chunkToWords(chunk);
      const scale = SCALES[scaleIndex];
      parts.unshift(scale ? `${chunkWords} ${scale}` : chunkWords);
    }
    remaining = Math.floor(remaining / 1000);
    scaleIndex += 1;
  }

  return toTitleCase(`${parts.join(" ")} only`);
}

module.exports = { amountInWords };
