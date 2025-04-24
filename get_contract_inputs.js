const fs = require("fs");

const inputPath = "tmp_cli/final/proof";
const outputHexPath = "tmp_cli/final/proof_clean.hex";
const outputInputsPath = "tmp_cli/final/public_inputs.json";

const HEADER_SIZE = 4;              // Still have to strip first 4 bytes for some reason
const NUM_PUBLIC_INPUTS = 16;       // Number of expected public inputs
const BYTES32_SIZE = 32;            // Each input is a 32-byte field element

const raw = fs.readFileSync(inputPath);
const body = raw.slice(HEADER_SIZE); // Skip header

const inputsRaw = body.slice(0, NUM_PUBLIC_INPUTS * BYTES32_SIZE);
const proofRaw = body.slice(NUM_PUBLIC_INPUTS * BYTES32_SIZE);

// Convert public inputs to hex-encoded bytes32 strings
const publicInputs = Array.from({ length: NUM_PUBLIC_INPUTS }, (_, i) => {
  const start = i * BYTES32_SIZE;
  const end = start + BYTES32_SIZE;
  return "0x" + inputsRaw.slice(start, end).toString("hex");
});

// Convert remaining bytes into a single hex string
const proofHex = "0x" + proofRaw.toString("hex");

// Write outputs
fs.writeFileSync(outputHexPath, proofHex);
fs.writeFileSync(outputInputsPath, JSON.stringify(publicInputs, null, 2));

console.log(`Extracted:
- ${publicInputs.length} public inputs → ${outputInputsPath}
- ${proofRaw.length} proof bytes → ${outputHexPath}`);
