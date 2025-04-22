const { spawnSync } = require("child_process");
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { writeFile } = require("fs/promises");
const { Noir } = require("@noir-lang/noir_js");
const path = require("path");
const fs = require("fs");

const CIRCUITS = {
  semaphore: JSON.parse(fs.readFileSync("./semaphore/target/semaphore.json")),
  join_semaphore_proofs: JSON.parse(fs.readFileSync("./join_semaphore_proofs/target/join_semaphore_proofs.json")),
};

function runBB(argsArray) {
  console.log(`Running: bb ${argsArray.join(" ")}`);
  const result = spawnSync("bb", argsArray, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`bb exited with code ${result.status}`);
  }
}

async function prove_UltraHonk_CLI() {
  const tmpDir = "./tmp_cli";
  mkdirSync(tmpDir, { recursive: true });

  const noir = new Noir(CIRCUITS.semaphore);
  const dataMerkleLen2 = {
    secretKey: "2736030358979909402780800718157159386076813972158567259200215660948447373040",
    indexes: "3",
    hashPath: [
      "222",
      "5580148635681152038824579634153994374025422922042242905608547916566050510583",
      "0", "0", "0", "0", "0", "0", "0", "0"
    ],
    merkleProofLength: "2",
    merkleTreeRoot: "15463896243170667872144918581954291954064138644202866266871757140238856236252",
    hashedScope: "32",
    hashedMessage: "43",
  };

  const dataMerkleLen10 = {
    secretKey: "2736030358979909402780800718157159386076813972158567259200215660948447373040",
    indexes: "1023",
    hashPath: [
      "1023",
      "7703609393926148861806470850414101587282113463695008072842235608796379066550",
      "11844355347052921836263554861941946966048634969958623466081587590542465759133",
      "19139877065885635288462009770448247355705152266967089952432395406553642434273",
      "15968895708437223385516840363948747630018846839139338811061474982723265688336",
      "1157389113544196424312834359849712044068249869160475042631259223915679649526",
      "9850169485007128596840836882853679679304108948486378818337816937810456934767",
      "7328698264973484546168581905250553935177218888248684409634832044961836320061",
      "3637363514134115024343666241307349483158812906758472113070175697206757306389",
      "7516686158158401448998320090358910253731148596461412688165783659432576569650"
    ],
    merkleProofLength: "10",
    merkleTreeRoot: "2057311462964865392236711171061056405638996999335557516757935831793017666139",
    hashedScope: "32",
    hashedMessage: "43",
  };

  // In the Semaphore circuit we have 4 public inputs
  const publicInputsCount = 4;
  
  // === PROOF 1 ===
  const out1 = path.join(tmpDir, "proof_1");
  mkdirSync(out1, { recursive: true });

  const { witness: witness_merkle_len2 } = await noir.execute(dataMerkleLen2);
  await writeFile(`${out1}/witness_len2.gz`, witness_merkle_len2);

  runBB([
    "prove", "-v",
    "--scheme", "ultra_honk",
    "-b", "./semaphore/target/semaphore.json",
    "-w", `${out1}/witness_len2.gz`,
    "-o", out1,
    "--output_format", "bytes_and_fields",
    "--honk_recursion", "1",
    "--recursive",
    "--init_kzg_accumulator",
    "--oracle_hash",
    "keccak"    
  ]);

  runBB([
    "write_vk", "-v",
    "--scheme", "ultra_honk",
    "-b", "./semaphore/target/semaphore.json",
    "-o", out1,
    "--output_format", "bytes_and_fields",
    "--honk_recursion", "1",
    "--init_kzg_accumulator",
    "--oracle_hash",
    "keccak"
  ]);

  // Extra check in between
  runBB([
    "verify",
    "--scheme", "ultra_honk",
    "-k", `${out1}/vk`,
    "-p", `${out1}/proof`,
    "--oracle_hash",
    "keccak"
  ]);

  const proofFields1 = JSON.parse(readFileSync(`${out1}/proof_fields.json`));
  const publicInputs1 = proofFields1.slice(0, publicInputsCount);
  const proofAsFields1 = [...proofFields1.slice(publicInputsCount)];

  // === PROOF 2 ===
  const out2 = path.join(tmpDir, "proof_2");
  mkdirSync(out2, { recursive: true });

  const { witness: witness_merkle_len10 } = await noir.execute(dataMerkleLen10);
  await writeFile(`${out2}/witness_len10.gz`, witness_merkle_len10);

  runBB([
    "prove", "-v",
    "--scheme", "ultra_honk",
    "-b", "./semaphore/target/semaphore.json",
    "-w", `${out2}/witness_len10.gz`,
    "-o", out2,
    "--output_format", "bytes_and_fields",
    "--honk_recursion", "1",
    "--recursive",
    "--init_kzg_accumulator",
    "--oracle_hash",
    "keccak"
  ]);

  // Extra check in between
  runBB([
    "verify",
    "--scheme", "ultra_honk",
    "-k", `${out1}/vk`,
    "-p", `${out2}/proof`,
    "--oracle_hash",
    "keccak"
  ]);

  const proofFields2 = JSON.parse(readFileSync(`${out2}/proof_fields.json`));
  const publicInputs2 = proofFields2.slice(0, publicInputsCount);
  const proofAsFields2 = [...proofFields2.slice(publicInputsCount)];

  // === Join 2 Semaphore proofs ===
  const outJoin = path.join(tmpDir, "join");
  mkdirSync(outJoin, { recursive: true });

  const vkFields = JSON.parse(readFileSync(`${out1}/vk_fields.json`));
  const vkHash = "0x" + "0".repeat(64);

  // Witness generation with noir_js works fine
  const CIRCUIT_JOIN = new Noir(CIRCUITS.join_semaphore_proofs);
  const { witness: witness_joined } = await CIRCUIT_JOIN.execute({
    sem1_verification_key: vkFields,
    sem1_proof: proofAsFields1,
    sem1_public_inputs: publicInputs1,
    sem1_key_hash: vkHash,
    sem2_verification_key: vkFields,
    sem2_proof: proofAsFields2,
    sem2_public_inputs: publicInputs2,
    sem2_key_hash: vkHash
  });

  await writeFile(`${outJoin}/witness_join.gz`, witness_joined);

  // Proving must be done with bb cli; the circuit is too large for bb.js
  runBB([
    "prove", "-v",
    "--scheme", "ultra_honk",
    "-b", "./join_semaphore_proofs/target/join_semaphore_proofs.json",
    "-w", `${outJoin}/witness_join.gz`,
    "-o", outJoin,
    "--oracle_hash",
    "keccak"
  ]);

  runBB([
    "write_vk", "-v",
    "--scheme", "ultra_honk",
    "-b", "./join_semaphore_proofs/target/join_semaphore_proofs.json",
    "-o", outJoin,
    "--honk_recursion", "1",
    "--oracle_hash",
    "keccak"
  ]);

  runBB([
    "verify",
    "--scheme", "ultra_honk",
    "-k", `${outJoin}/vk`,
    "-p", `${outJoin}/proof`,
    "--oracle_hash",
    "keccak"
  ]);

  console.log("ˆˆˆˆˆˆˆRecursive proof verified successfullyˆˆˆˆˆˆˆ");
}

prove_UltraHonk_CLI();
