const { spawnSync } = require("child_process");
const { readFileSync, writeFileSync, mkdirSync } = require("fs");
const { writeFile } = require("fs/promises");
const { Noir } = require("@noir-lang/noir_js");
const path = require("path");
const fs = require("fs");
const { performance } = require("perf_hooks");

function compileCircuit(pathToCircuit) {
  console.log(`Compiling circuit at: ${pathToCircuit}`);
  const result = spawnSync("nargo", ["compile"], {
    cwd: pathToCircuit,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(`Failed to compile circuit at ${pathToCircuit}`);
  }
}

function runBB(argsArray) {
  console.log(`Running: bb ${argsArray.join(" ")}`);
  const result = spawnSync("bb", argsArray, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`bb exited with code ${result.status}`);
  }
}

async function prove_UltraHonk_CLI() {
  compileCircuit("./semaphore");
  compileCircuit("./join_semaphore_proofs");
  compileCircuit("./join_aggregated_proofs");

  const CIRCUITS = {
    semaphore: JSON.parse(fs.readFileSync("./semaphore/target/semaphore.json")),
    join_semaphore_proofs: JSON.parse(fs.readFileSync("./join_semaphore_proofs/target/join_semaphore_proofs.json")),
    join_agg_proofs: JSON.parse(fs.readFileSync("./join_aggregated_proofs/target/join_aggregated_proofs.json")),
  };
  
  const tmpDir = "./tmp_cli";
  mkdirSync(tmpDir, { recursive: true });

  const noir = new Noir(CIRCUITS.semaphore);
  const dataMerkleLen1 = {
    secretKey: "2736030358979909402780800718157159386076813972158567259200215660948447373040",
    indexes: "1",
    hashPath: [
      "17197790661637433027297685226742709599380837544520340689137581733613433332983",
      "0", "0", "0", "0", "0", "0", "0", "0", "0"
    ],
    merkleProofLength: "1",
    merkleTreeRoot: "14749601632619677010117355190090900871659822873947496064081607008658671249718",
    hashedScope: "32",
    hashedMessage: "43",
  };
  
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

  const dataMerkleLen9 = {
    secretKey: "123",
    indexes: "512",
    hashPath: [
      "111",
      "222",
      "333",
      "444",
      "555",
      "666",
      "777",
      "888",
      "999",
      "0"
    ],
    merkleProofLength: "9",
    merkleTreeRoot: "5274611616714568986968667627590641996389994354429856948343448712098966975250",
    hashedScope: "42",
    hashedMessage: "99",
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
  
  // Since this is just for testing how many layers we can go, we'll reuse the same 4 proofs twice
    /*
                       AGG CIRCUIT
                    /               \
                  /                   \
          AGG CIRCUIT               AGG CIRCUIT
        /           \             /              \
    JOIN            JOIN        JOIN            JOIN
    /   \          /    \       /   \          /    \
  S1    S2        S3    S4     S1   S3        S2    S4
  */
  // === PROOF 1 ===
  const out1 = path.join(tmpDir, "proof_1");
  mkdirSync(out1, { recursive: true });

  const { witness: witness_merkle_len1 } = await noir.execute(dataMerkleLen1);
  await writeFile(`${out1}/witness_len1.gz`, witness_merkle_len1);

  runBB([
    "prove", "-v",
    "--scheme", "ultra_honk",
    "-b", "./semaphore/target/semaphore.json",
    "-w", `${out1}/witness_len1.gz`,
    "-o", out1,
    "--output_format", "bytes_and_fields",
    "--honk_recursion", "1",
    "--recursive",
    "--init_kzg_accumulator"
  ]);

  console.log("PROVED SEMAPHORE PROOF 1");

  runBB([
    "write_vk", "-v",
    "-s", "ultra_honk",
    "-b", "./semaphore/target/semaphore.json",
    "-o", out1,
    "--output_format", "bytes_and_fields",
    "--honk_recursion", "1",
    "--init_kzg_accumulator"
  ]);

  const proofFields1 = JSON.parse(readFileSync(`${out1}/proof_fields.json`));
  const publicInputs1 = proofFields1.slice(0, publicInputsCount);
  const proofAsFields1 = [...proofFields1.slice(publicInputsCount)];

  // === PROOF 2 ===
  const out2 = path.join(tmpDir, "proof_2");
  mkdirSync(out2, { recursive: true });

  const { witness: witness_merkle_len2 } = await noir.execute(dataMerkleLen2);
  await writeFile(`${out2}/witness_len2.gz`, witness_merkle_len2);

  runBB([
    "prove", "-v",
    "--scheme", "ultra_honk",
    "-b", "./semaphore/target/semaphore.json",
    "-w", `${out2}/witness_len2.gz`,
    "-o", out2,
    "--output_format", "bytes_and_fields",
    "--honk_recursion", "1",
    "--recursive",
    "--init_kzg_accumulator"
  ]);

  console.log("PROVED SEMAPHORE PROOF 2");

  const proofFields2 = JSON.parse(readFileSync(`${out2}/proof_fields.json`));
  const publicInputs2 = proofFields2.slice(0, publicInputsCount);
  const proofAsFields2 = [...proofFields2.slice(publicInputsCount)];
  
  // === PROOF 3 ===
  const out3 = path.join(tmpDir, "proof_3");
  mkdirSync(out3, { recursive: true });

  const { witness: witness_merkle_len9 } = await noir.execute(dataMerkleLen9);
  await writeFile(`${out3}/witness_len9.gz`, witness_merkle_len9);

  runBB([
    "prove", "-v",
    "--scheme", "ultra_honk",
    "-b", "./semaphore/target/semaphore.json",
    "-w", `${out3}/witness_len9.gz`,
    "-o", out3,
    "--output_format", "bytes_and_fields",
    "--honk_recursion", "1",
    "--recursive",
    "--init_kzg_accumulator"
  ]);

  console.log("PROVED SEMAPHORE PROOF 3");

  const proofFields3 = JSON.parse(readFileSync(`${out3}/proof_fields.json`));
  const publicInputs3 = proofFields3.slice(0, publicInputsCount);
  const proofAsFields3 = [...proofFields3.slice(publicInputsCount)];

  // === PROOF 4 ===
  const out4 = path.join(tmpDir, "proof_4");
  mkdirSync(out4, { recursive: true });

  const { witness: witness_merkle_len10 } = await noir.execute(dataMerkleLen10);
  await writeFile(`${out4}/witness_len10.gz`, witness_merkle_len10);

  runBB([
    "prove", "-v",
    "--scheme", "ultra_honk",
    "-b", "./semaphore/target/semaphore.json",
    "-w", `${out4}/witness_len10.gz`,
    "-o", out4,
    "--output_format", "bytes_and_fields",
    "--honk_recursion", "1",
    "--recursive",
    "--init_kzg_accumulator"
  ]);
  
  console.log("PROVED SEMAPHORE PROOF 4");

  const proofFields4 = JSON.parse(readFileSync(`${out4}/proof_fields.json`));
  const publicInputs4 = proofFields4.slice(0, publicInputsCount);
  const proofAsFields4 = [...proofFields4.slice(publicInputsCount)];
  
  // === Generate 4 JOIN proofs to aggregate all 8 Semaphore proofs ===
  // === 1 ===
  const aggStart = performance.now();

  const outJoin1 = path.join(tmpDir, "join_1");
  mkdirSync(outJoin1, { recursive: true });

  const vkFields = JSON.parse(readFileSync(`${out1}/vk_fields.json`));
  const vkHash = "0x" + "0".repeat(64);

  // Witness generation with noir_js works fine
  const CIRCUIT_JOIN = new Noir(CIRCUITS.join_semaphore_proofs);
  const { witness: witness_joined_1 } = await CIRCUIT_JOIN.execute({
    sem1_verification_key: vkFields,
    sem1_proof: proofAsFields1,
    sem1_public_inputs: publicInputs1,
    sem1_key_hash: vkHash,
    sem2_verification_key: vkFields,
    sem2_proof: proofAsFields2,
    sem2_public_inputs: publicInputs2,
    sem2_key_hash: vkHash
  });

  await writeFile(`${outJoin1}/witness_join.gz`, witness_joined_1);

  // Proving must be done with bb cli; the circuit is too large for bb.js
  runBB([
    "prove", "-v",
    "--output_format", "bytes_and_fields",
    "-b", "./join_semaphore_proofs/target/join_semaphore_proofs.json",
    "-w", `${outJoin1}/witness_join.gz`,
    "-o", outJoin1,
    "--recursive"
  ]);

  // The vk is the same for all JOIN proofs
  runBB([
    "write_vk", "-v",
    "--scheme", "ultra_honk",
    "--output_format", "bytes_and_fields",
    "-b", "./join_semaphore_proofs/target/join_semaphore_proofs.json",
    "-o", outJoin1,
    "--honk_recursion", "1"
  ]);

  // runBB([
  //   "verify",
  //   "-k", `${outJoin1}/vk`,
  //   "-p", `${outJoin1}/proof`
  // ]);
  const proofFields_join1 = JSON.parse(readFileSync(`${outJoin1}/proof_fields.json`));

  // === 2 ===
  const outJoin2 = path.join(tmpDir, "join_2");
  mkdirSync(outJoin2, { recursive: true });

  const { witness: witness_joined_2 } = await CIRCUIT_JOIN.execute({
    sem1_verification_key: vkFields,
    sem1_proof: proofAsFields3,
    sem1_public_inputs: publicInputs3,
    sem1_key_hash: vkHash,
    sem2_verification_key: vkFields,
    sem2_proof: proofAsFields4,
    sem2_public_inputs: publicInputs4,
    sem2_key_hash: vkHash
  });

  await writeFile(`${outJoin2}/witness_join.gz`, witness_joined_2);

  runBB([
    "prove", "-v",
    "--output_format", "bytes_and_fields",
    "-b", "./join_semaphore_proofs/target/join_semaphore_proofs.json",
    "-w", `${outJoin2}/witness_join.gz`,
    "-o", outJoin2,
    "--recursive"
  ]);

  // runBB([
  //   "verify",
  //   "-k", `${outJoin1}/vk`,
  //   "-p", `${outJoin2}/proof`
  // ]);
  const proofFields_join2 = JSON.parse(readFileSync(`${outJoin2}/proof_fields.json`));

  // === 3 ===
  const outJoin3 = path.join(tmpDir, "join_3");
  mkdirSync(outJoin3, { recursive: true });

  const { witness: witness_joined_3 } = await CIRCUIT_JOIN.execute({
    sem1_verification_key: vkFields,
    sem1_proof: proofAsFields1,
    sem1_public_inputs: publicInputs1,
    sem1_key_hash: vkHash,
    sem2_verification_key: vkFields,
    sem2_proof: proofAsFields3,
    sem2_public_inputs: publicInputs3,
    sem2_key_hash: vkHash
  });

  await writeFile(`${outJoin3}/witness_join.gz`, witness_joined_3);

  runBB([
    "prove", "-v",
    "--output_format", "bytes_and_fields",
    "-b", "./join_semaphore_proofs/target/join_semaphore_proofs.json",
    "-w", `${outJoin3}/witness_join.gz`,
    "-o", outJoin3,
    "--recursive"
  ]);

  // runBB([
  //   "verify",
  //   "-k", `${outJoin1}/vk`,
  //   "-p", `${outJoin3}/proof`
  // ]);
  const proofFields_join3 = JSON.parse(readFileSync(`${outJoin3}/proof_fields.json`));

  // === 4 ===
  const outJoin4 = path.join(tmpDir, "join_4");
  mkdirSync(outJoin4, { recursive: true });

  const { witness: witness_joined_4 } = await CIRCUIT_JOIN.execute({
    sem1_verification_key: vkFields,
    sem1_proof: proofAsFields2,
    sem1_public_inputs: publicInputs2,
    sem1_key_hash: vkHash,
    sem2_verification_key: vkFields,
    sem2_proof: proofAsFields4,
    sem2_public_inputs: publicInputs4,
    sem2_key_hash: vkHash
  });

  await writeFile(`${outJoin4}/witness_join.gz`, witness_joined_4);

  runBB([
    "prove", "-v",
    "--output_format", "bytes_and_fields",
    "-b", "./join_semaphore_proofs/target/join_semaphore_proofs.json",
    "-w", `${outJoin4}/witness_join.gz`,
    "-o", outJoin4,
    "--recursive"
  ]);

  // runBB([
  //   "verify",
  //   "-k", `${outJoin1}/vk`,
  //   "-p", `${outJoin4}/proof`
  // ]);
  const proofFields_join4 = JSON.parse(readFileSync(`${outJoin4}/proof_fields.json`));

  // === Combine the 4 JOIN proofs into 2 AGG proofs ===
  const agg1 = path.join(tmpDir, "agg1");
  mkdirSync(agg1, { recursive: true });

  const vkFields_joined = JSON.parse(readFileSync(`${outJoin1}/vk_fields.json`));

  const CIRCUIT_AGG = new Noir(CIRCUITS.join_agg_proofs);
  const { witness: witness_agg1 } = await CIRCUIT_AGG.execute({
    agg1_verification_key: vkFields_joined,
    agg1_proof: proofFields_join1,
    agg1_key_hash: vkHash,
    agg2_verification_key: vkFields_joined,
    agg2_proof: proofFields_join2,
    agg2_key_hash: vkHash
  });

  await writeFile(`${agg1}/witness.gz`, witness_agg1);

  runBB([
    "prove", "-v",
    "--output_format", "bytes_and_fields",
    "-b", "./join_aggregated_proofs/target/join_aggregated_proofs.json",
    "-w", `${agg1}/witness.gz`,
    "-o", agg1,
    "--recursive"
  ]);

  runBB([
    "write_vk", "-v",
    "--scheme", "ultra_honk",
    "--output_format", "bytes_and_fields",
    "-b", "./join_aggregated_proofs/target/join_aggregated_proofs.json",
    "-o", agg1,
    "--honk_recursion", "1"
  ]);

  // runBB([
  //   "verify",
  //   "-k", `${agg1}/vk`,
  //   "-p", `${agg1}/proof`
  // ]);
  const proofFields_agg1 = JSON.parse(readFileSync(`${agg1}/proof_fields.json`));

  const agg2 = path.join(tmpDir, "agg2");
  mkdirSync(agg2, { recursive: true });
  
  const { witness: witness_agg2 } = await CIRCUIT_AGG.execute({
    agg1_verification_key: vkFields_joined,
    agg1_proof: proofFields_join3,
    agg1_key_hash: vkHash,
    agg2_verification_key: vkFields_joined,
    agg2_proof: proofFields_join4,
    agg2_key_hash: vkHash
  });

  await writeFile(`${agg2}/witness.gz`, witness_agg2);

  runBB([
    "prove", "-v",
    "--output_format", "bytes_and_fields",
    "-b", "./join_aggregated_proofs/target/join_aggregated_proofs.json",
    "-w", `${agg2}/witness.gz`,
    "-o", agg2,
    "--recursive"
  ]);

  // runBB([
  //   "verify",
  //   "-k", `${agg1}/vk`,
  //   "-p", `${agg2}/proof`
  // ]);
  const proofFields_agg2 = JSON.parse(readFileSync(`${agg2}/proof_fields.json`));

  // === Generate a final "root" proof ===
  // Note that this is also an AGG Circuit proof
  const final = path.join(tmpDir, "final");
  mkdirSync(final, { recursive: true });

  const vkFields_root = JSON.parse(readFileSync(`${agg1}/vk_fields.json`));
  const { witness: witness_root } = await CIRCUIT_AGG.execute({
    agg1_verification_key: vkFields_root,
    agg1_proof: proofFields_agg1,
    agg1_key_hash: vkHash,
    agg2_verification_key: vkFields_root,
    agg2_proof: proofFields_agg2,
    agg2_key_hash: vkHash
  });

  await writeFile(`${final}/witness_final.gz`, witness_root);

  runBB([
    "write_vk", "-v",
    "--scheme", "ultra_honk",
    "--oracle_hash", "keccak",
    "-b", "./join_aggregated_proofs/target/join_aggregated_proofs.json",
    "-o", final,
    "--honk_recursion", "1"
  ]);

  runBB([
    "prove", "-v",
    "--scheme", "ultra_honk",
    "--oracle_hash", "keccak",
    "-b", "./join_aggregated_proofs/target/join_aggregated_proofs.json",
    "-w", `${final}/witness_final.gz`,
    "-o", final,
    "--recursive"
  ]);

  // Generate Solidity Verifier for this proof
    // bb write_solidity_verifier -k ./target/vk -o ./target/Verifier.sol
  runBB([
    "write_solidity_verifier",
    "--scheme", "ultra_honk",
    "-k", `${final}/vk`,
    "-o", `${final}/Verifier.sol`
  ]);
  const aggEnd = performance.now();
  const durationMs = aggEnd - aggStart;
  
  // All aggregation proofs generated in 203.43 seconds
  console.log(`All aggregation proofs generated in ${(durationMs / 1000).toFixed(2)} seconds`);

  // The proof has 4 bytes too many for some reason
  // There are 16 pub inputs
  // generate the inputs for Solidity verifier with `get_contract_inputs.js`

  runBB([
    "verify",
    "--scheme", "ultra_honk",
    "--oracle_hash", "keccak",
    "-k", `${final}/vk`,
    "-p", `${final}/proof`
  ]);


  console.log("ˆˆˆˆˆˆˆ\"Root\" proof verified successfullyˆˆˆˆˆˆˆ");
}

prove_UltraHonk_CLI();
