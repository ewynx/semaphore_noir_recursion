const { UltraHonkBackend } = require("@aztec/bb.js");
const { Noir } = require("@noir-lang/noir_js");
const { assert } = require("console");
const fs = require("fs");
const os = require("os");

const CIRCUITS = {
  semaphore: JSON.parse(fs.readFileSync("./semaphore/target/semaphore.json")),
  join_semaphore_proofs: JSON.parse(fs.readFileSync("./join_semaphore_proofs/target/join_semaphore_proofs.json")),
};

function proofToFields(bytes) {
  const fields = [];
  for (let i = 0; i < bytes.length; i += 32) {
    const fieldBytes = new Uint8Array(32);
    const end = Math.min(i + 32, bytes.length);
    for (let j = 0; j < end - i; j++) {
      fieldBytes[j] = bytes[i + j];
    }
    fields.push(Buffer.from(fieldBytes));
  }
  return fields.map((field) => "0x" + field.toString("hex"));
}

async function prove_UltraHonk() {
  // const { execSync } = require("child_process");
  // execSync("nargo execute --package circuit_1");
  // execSync("nargo compile --package recurse");
  // execSync("bb prove -b ./circuit_1/target/circuit_1.json -w ./circuit_1/target/circuit_1.gz -o ./circuit_1/proof --recursive --honk_recursion 1 --output_format fields");
  // execSync("bb write_vk -b ./circuit_1/target/circuit_1.json -o ./circuit_1/proof --init_kzg_accumulator --honk_recursion 1 --output_format fields");

  const noir = new Noir(CIRCUITS.semaphore);
  const backend = new UltraHonkBackend(CIRCUITS.semaphore.bytecode, { threads: os.cpus() }, { recursive: true });

  // Example data for both
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
  
  

  const { witness: witness_merkle_len2 } = await noir.execute(dataMerkleLen2);
  const { witness: witness_merkle_len10 } = await noir.execute(dataMerkleLen10);

  console.time("prove");
  const sem_proof_2 = await backend.generateProof(witness_merkle_len2);
  const sem_proof_10 = await backend.generateProof(witness_merkle_len10);
  // const { publicInputs, proof: proofAsFields } = await backend.generateProofForRecursiveAggregation(witness);
  console.timeEnd("prove");

  // In the Semaphore circuit we have 4 public inputs
  const publicInputsCount = 4;

  const publicInputs2 = sem_proof_2.publicInputs.slice(0, publicInputsCount);
  const proofAsFields2 = [...sem_proof_2.publicInputs.slice(publicInputsCount), ...proofToFields(sem_proof_2.proof)];
  assert(proofAsFields2.length === 456);

  const publicInputs10 = sem_proof_10.publicInputs.slice(0, publicInputsCount);
  const proofAsFields10 = [...sem_proof_10.publicInputs.slice(publicInputsCount), ...proofToFields(sem_proof_10.proof)];
  assert(proofAsFields10.length === 456);

  // This should work, but it seems like it needs to be updated to handle recursive aggregation.
  // https://github.com/AztecProtocol/aztec-packages/blob/d47c74ad5d5789e69b5efbabc01cf3347705ba15/barretenberg/ts/src/barretenberg/backend.ts#L295
  // const { vkAsFields } = await backend.generateRecursiveProofArtifacts(proof, publicInputsCount);

  // so for now, let's just get the values generated with `bb`
  // In this case, both Semaphore circuits use the same MerkleTreeDepth and thus have the same vk
  const vkAsFields = JSON.parse(fs.readFileSync("./semaphore/proof/vk_fields.json"));
  const vkHash = "0x" + "0".repeat(64);

  // VERIFY Semaphore Proofs
  const isValid_2 = await backend.verifyProof(sem_proof_2);
  assert(isValid_2);
  const isValid_10 = await backend.verifyProof(sem_proof_10);
  assert(isValid_10);
  console.log("Intermediate proofs verified");

  // Join 2 Semaphore proofs
  const semaphore_joined = new Noir(CIRCUITS.join_semaphore_proofs);
  const backend_recursive = new UltraHonkBackend(CIRCUITS.join_semaphore_proofs.bytecode, { threads: os.cpus() }, { recursive: true });

  const sem_proofs_input = {
    sem1_verification_key: vkAsFields,
    sem1_proof: proofAsFields2,
    sem1_public_inputs: publicInputs2,
    sem1_key_hash: vkHash,
    sem2_verification_key: vkAsFields,
    sem2_proof: proofAsFields10,
    sem2_public_inputs: publicInputs10,
    sem2_key_hash: vkHash,
  };

  const { witness: witness_joined } = await semaphore_joined.execute(sem_proofs_input);
  console.time("prove_recursive");
  const proof_recursive = await backend_recursive.generateProof(witness_joined);
  console.timeEnd("prove_recursive");
  const verified = await backend_recursive.verifyProof(proof_recursive);
  assert(verified);
  console.log("verified", verified);
}

prove_UltraHonk();
