import json
from pathlib import Path

from jsonschema import Draft202012Validator
from referencing import Registry, Resource


ROOT = Path(__file__).resolve().parents[2]
CONTRACT = ROOT / "docs" / "shot-review-contract"
SCHEMAS = CONTRACT / "schemas"
FIXTURES = CONTRACT / "fixtures"


def load(name):
    return json.loads((SCHEMAS / name).read_text(encoding="utf-8"))


def fixture(name):
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


model_schema = load("shot-review-model.schema.json")
revision_schema = load("revision-overlay.schema.json")
input_schema = load("single-shot-reanalysis-input.schema.json")
output_schema = load("single-shot-reanalysis-output.schema.json")

for schema in (model_schema, revision_schema, input_schema, output_schema):
    Draft202012Validator.check_schema(schema)

registry = Registry().with_resource(
    revision_schema["$id"], Resource.from_contents(revision_schema)
)
Draft202012Validator(model_schema).validate(fixture("shot-review-model.json"))
Draft202012Validator(revision_schema).validate(fixture("manual-revision-overlay.example.json"))
Draft202012Validator(input_schema).validate(fixture("single-shot-reanalysis-input.example.json"))
Draft202012Validator(
    output_schema,
    registry=registry,
).validate(fixture("single-shot-reanalysis-output.example.json"))

print(json.dumps({"status": "PASS", "level": "structural", "schemas": 4, "fixtures": 4}))
