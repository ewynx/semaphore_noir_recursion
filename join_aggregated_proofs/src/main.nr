use dep::std::verify_proof;

// Join (verify) 2 Aggregation proofs together
fn main(
    agg1_verification_key: [Field; 128],
    agg1_proof: [Field; 456],
    agg1_key_hash: Field,
    agg2_verification_key: [Field; 128],
    agg2_proof: [Field; 456],
    agg2_key_hash: Field,
) {
    // verify_proof(...) aggregates data for the verifier, the actual verification will be done when the full proof is verified using nargo verify. nargo prove may generate an invalid proof if bad data is used as input to verify_proof
    verify_proof(agg1_verification_key, agg1_proof, [], agg1_key_hash);

    verify_proof(agg2_verification_key, agg2_proof, [], agg2_key_hash);
}
