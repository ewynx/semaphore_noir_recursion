use dep::std::verify_proof;

// Join 2 Semaphore proofs into a single proof
fn main(
    sem1_verification_key: [Field; 128],
    sem1_proof: [Field; 456],
    sem1_public_inputs: [Field; 4],
    sem1_key_hash: Field,
    sem2_verification_key: [Field; 128],
    sem2_proof: [Field; 456],
    sem2_public_inputs: [Field; 4],
    sem2_key_hash: Field,
) {
    // verify_proof(...) aggregates data for the verifier, the actual verification will be done when the full proof is verified using nargo verify. nargo prove may generate an invalid proof if bad data is used as input to verify_proof
    verify_proof(
        sem1_verification_key,
        sem1_proof,
        sem1_public_inputs,
        sem1_key_hash,
    );

    verify_proof(
        sem2_verification_key,
        sem2_proof,
        sem2_public_inputs,
        sem2_key_hash,
    );
}
