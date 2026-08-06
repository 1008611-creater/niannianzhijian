const assert = require('assert/strict');
const {validate,qaReferenceFiles} = require('./bridge/niannian_step03_vision_qa');

function verdict(overrides={}) {
  return {
    quality_passed:false,
    market_identity_passed:true,
    subject_identity_passed:true,
    composition_passed:true,
    people_count_passed:true,
    action_and_hands_passed:true,
    props_and_screen_passed:true,
    text_language_passed:true,
    source_actor_leakage_detected:false,
    poster_layout_detected:false,
    findings:[],
    ...overrides
  };
}

const accepted=validate(verdict());
assert.equal(accepted.passed,true);
assert.equal(accepted.quality_passed,true);
const rejected=validate(verdict({text_language_passed:false,quality_passed:true}));
assert.equal(rejected.passed,false);
assert.equal(rejected.quality_passed,false);
assert.throws(()=>validate({}),error=>error.code==='STEP03_QA_SCHEMA_INVALID');
const references=['previous-board.png','source-frame.png'];
assert.deepEqual(qaReferenceFiles({type:'character',prompt:'[模板版本] character-authority-sheet-v3.4-ciwei-character-only-board'},references),[]);
assert.deepEqual(qaReferenceFiles({type:'character',prompt:'[模板版本] character-authority-sheet-v3.3-ciwei-prop-locked-board'},references),references);
assert.deepEqual(qaReferenceFiles({type:'firstframe',prompt:'普通首帧'},references),references);
process.stdout.write(JSON.stringify({ok:true,quality_is_derived_from_required_checks:true,failed_detail_cannot_be_overridden:true,previous_rejected_board_not_resent_to_qa:true})+'\n');
