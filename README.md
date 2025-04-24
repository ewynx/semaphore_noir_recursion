# Proof aggregation for Semaphore Noir

The goal is to aggregate multiple Semaphore proofs, so ultimately we have a single proof, which upon verification shows that all the proofs were correct. This repo explores this possibility.

**Note:** This repo was created following [this excellent example](https://github.com/teddav/noir-recursive) or recursion with Noir/bb by [teddav](https://github.com/teddav). 

## Explanation

There are 2 types of proofs:
- Semaphore Proof
- Aggregation Proof

We assume the usecase that there are `n` Semaphore proofs and we want to end up with a single Aggregation proof.

The are different steps possible:
- Aggregate Semaphore proofs per 2 (we can add more circuits to increase this number as well)
- Aggegregate a single Semaphore proof with an Aggegrated proof
- Aggegrate 2 Aggregation proofs

The difference for the proof types is the number of public inputs, which is why we need multiple circuits. 

## Current state

We can aggregate 2, 4 and 8 Semaphore proofs in different scripts. There is also a manual walk through for aggregating 2 Semaphore proogs. 

The scripts work using `bb cli`; it doesn't work using `bb.js`. This is probably due to wasm memory limit since we are dealing with a large circuit ([reference](https://discord.com/channels/1113924620781883405/1209885496256503888/1309181119559893103) to Discord comment about this). More details about the error below. 

## Run scripts that use `bb cli`

### Aggregate 4 proofs

Aggregate 4 Semaphore proofs. This basically happens in the following structure:

```bash
        ROOT CIRCUIT
        /           \
    JOIN            JOIN
    /   \          /    \
  S1    S2        S3    S4
```
1. Generate the 4 Semaphore proofs
2. Aggregate them per 2 into a "Joined" proof
3. Create a final "Root" proof that verifies the Joined proofs
4. Verify the "Root" proof

Note that this uses 3 different circuits. 

```bash
node aggegrate_4_proofs.js
```
### Aggregate 2 proofs
You can also aggregate 2 Semaphore proofs into a Joined proof and verify it. (Note that this uses 2 different circuits.) Run:

```bash
node aggegrate_2_proofs.js
```

### Aggregate 8 proofs & verify on-chain

Aggregate 8 Semaphore proofs in the following way:
```
                       AGG CIRCUIT
                    /               \
                  /                   \
          AGG CIRCUIT               AGG CIRCUIT
        /           \             /              \
    JOIN            JOIN        JOIN            JOIN
    /   \          /    \       /   \          /    \
  S1    S2        S3    S4     S1   S3        S2    S4
```
(Note that we use each test proof twice, but in different compositions.)

To generate all the proofs, as well as the Solidity verifer run:
```bash
node aggegrate_8_proofs.js
```

To extract the correct input data for the contract (from the proof) run:
```bash
node get_contract_input.js
```

You can find the contract in `tmp_cli/final/Verifier.sol`. (Note that for deployment in Remix there are instruction steps [here](https://noir-lang.org/docs/how_to/how-to-solidity-verifier/#step-3---deploying), and you need to turn on optimization.)

You can find the public inputs in `tmp_cli/final/public_inputs.json` and the proof bytes in `tmp_cli/final/proof_clean.hex`. 

This was tested (positively) with:
- `bb v0.82.2`
- `nargo 1.0.0-beta.3`

## Aggregate 2 proofs: Manual steps with `nargo` and `bb`
Versions: `bb 0.82.2` and `nargo 1.0.0-beta.3`.

These steps detail exactly how to generate 2 Semaphore proofs and then generate an aggregation proof. The `semaphore` folder contains the [Semaphore Noir circuit,](https://github.com/hashcloak/semaphore-noir/blob/noir-support/packages/circuits-noir/src/main.nr) as well as 2 filled out `Prover.toml`s with vaid testdata. 

Note that this circuit is fixed for `MAX_DEPTH` 10, and the steps assume that both proofs were generated with the same circuit. However in practice, the circuits can be for a different depth, then you just have to make sure you pass on the correct verification key.

```bash
cd semaphore && mkdir proof && mkdir proof_sem2 && mkdir proof_sem10

# Generate proof for Merkle proof length 2
nargo execute -p Prover_len2 semaphore2.gz
# Generate proof for Merkle proof length 10
nargo execute -p Prover_len10 semaphore10.gz

# generate proof for length 2
bb prove -v -s ultra_honk -b "./target/semaphore.json" -w "./target/semaphore2.gz" -o proof_sem2 --output_format bytes_and_fields --honk_recursion 1 --recursive --init_kzg_accumulator
# generate proof for length 10
bb prove -v -s ultra_honk -b "./target/semaphore.json" -w "./target/semaphore10.gz" -o proof_sem10 --output_format bytes_and_fields --honk_recursion 1 --recursive --init_kzg_accumulator

# generate VK (same for both)
bb write_vk -v -s ultra_honk -b "./target/semaphore.json" -o ./proof --output_format bytes_and_fields --honk_recursion 1 --init_kzg_accumulator

bb verify -s ultra_honk -k ./proof/vk -p ./proof_sem2/proof
bb verify -s ultra_honk -k ./proof/vk -p ./proof_sem10/proof
```

Now we'll aggregate the 2 Semaphore proofs using the circuit in `join_semaphore_proofs`.

We need to fill `Prover.toml` with the right information, coming from the previous 2 proofs.

From each of the proofs `proof_sem2/proof_fields.json` and `proof_sem10/proof_fields.json`:
- cut from `proof_fields.json` the first 4 inputs into `sem1_public_inputs` and `sem2_public_inputs` respectively
- copy the leftover values into `sem1_proof` and `sem2_proof` respectively

Furthermore:
- Copy the verification key from `semaphore/proof/vk_fields.json` into `sem1_verification_key` and `sem2_verification_key`
- Fill `sem1_key_hash` and `sem2_key_hash` with `0x0000000000000000000000000000000000000000000000000000000000000000`

```bash
cd join_semaphore_proofs
mkdir proof
nargo execute

bb prove -v -b "./target/join_semaphore_proofs.json" -w "./target/join_semaphore_proofs.gz" -o ./proof  --output_format bytes_and_fields --recursive
bb write_vk -v -b "./target/join_semaphore_proofs.json" -o ./proof --honk_recursion 1
bb verify -k ./proof/vk -p ./proof/proof
# Proof verified successfully
```

## `bb.js` limitation

If we replace the `bb cli` calls with `bb.js` functionality in `aggegrate_2_proofs.js` it gives the following error:
```
node prove.js
prove: 7.810s
Intermediate proofs verified
node:internal/process/promises:288
            triggerUncaughtException(err, true /* fromPromise */);
            ^

Error [RuntimeError]: unreachable
    at wasm://wasm/03143b56:wasm-function[19242]:0xbc447a
    at wasm://wasm/03143b56:wasm-function[1486]:0x7aa16
    at wasm://wasm/03143b56:wasm-function[1489]:0x7ab9a
    at wasm://wasm/03143b56:wasm-function[8482]:0x2e3e22
    at wasm://wasm/03143b56:wasm-function[713]:0x4736d
    at wasm://wasm/03143b56:wasm-function[823]:0x48db0
    at wasm://wasm/03143b56:wasm-function[822]:0x48d9d
    at wasm://wasm/03143b56:wasm-function[142]:0x27c19
    at wasm://wasm/03143b56:wasm-function[103]:0x2591b
    at wasm://wasm/03143b56:wasm-function[17353]:0xb27290

Node.js v18.20.4
```

This error doesn't occur when the recursion circuit only contains a single verification (but all the same inputs). 

It seems like the circuitsize might be too large and hit the wasm memory limit. This is a [comment](https://discord.com/channels/1113924620781883405/1209885496256503888/1309181119559893103) we read in the Noir Discord. 
