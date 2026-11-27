.PHONY: test run fetch lint

test:
	cd backend && pytest tests -q

fetch:
	./scripts/fetch_weights.sh

run:
	./scripts/run_local.sh

lint:
	ruff check .
	for f in frontend/js/*.js; do node --check $$f; done
