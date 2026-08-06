import copy
import json
import sys

from jsonschema import Draft202012Validator


def main():
    if len(sys.argv) != 3:
        raise SystemExit("usage: test_step05_reference_schema.py SCHEMA STATE")
    with open(sys.argv[1], "r", encoding="utf-8") as handle:
        schema = json.load(handle)
    with open(sys.argv[2], "r", encoding="utf-8") as handle:
        state = json.load(handle)
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema)
    validator.validate(state)

    for field in ("locked_prompt_lineage", "dependencies", "readback", "qa"):
        invalid = copy.deepcopy(state)
        del invalid["refs"][0][field]
        if not list(validator.iter_errors(invalid)):
            raise AssertionError("missing field unexpectedly valid: " + field)

    invalid_scope = copy.deepcopy(state)
    invalid_scope["project"]["execution_scope"]["video_group_ids"].append("V02")
    if not list(validator.iter_errors(invalid_scope)):
        raise AssertionError("multi-group minimal scope unexpectedly valid")

    print(json.dumps({"ok": True, "validator": "Draft202012Validator", "negative_cases": 5}))


if __name__ == "__main__":
    main()
