.PHONY: test run fetch

test:
	cd backend && pytest tests -q

fetch:
	./scripts/fetch_weights.sh

run:
	./scripts/run_local.sh
