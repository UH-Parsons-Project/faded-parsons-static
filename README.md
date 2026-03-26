
[![CI](https://github.com/UH-Parsons-Project/faded-parsons-static/actions/workflows/main.yml/badge.svg)](https://github.com/UH-Parsons-Project/faded-parsons-static/actions/workflows/main.yml)

[![Codecov](https://codecov.io/gh/UH-Parsons-Project/parsons-code-lab/branch/main/graph/badge.svg)](https://codecov.io/gh/UH-Parsons-Project/parsons-code-lab)

# Python Faded Parsons Problems

Check it out here:

https://parsonscodelab.web.helsinki.fi

## Running the website

### To run locally:

```
docker compose --profile web up --build
```

The website can be accessed at http://localhost:8000/.

### Run all tests at once:

Run Pytest unittests and Playwright E2E-tests simultaneously.

```
./scripts/run-all-tests.sh
```

## Project Wiki
https://github.com/UH-Parsons-Project/parsons-code-lab/wiki

## Definition of Done

Code is validated and all tests are passing, docstrings are written, code is reviewed and approved by a peer developer before merging to the main branch, and the feature is successfully deployed to the production environment.

## Product and Sprint Backlogs
[Product Backlog](https://github.com/orgs/UH-Parsons-Project/projects/12)

## Original codebase

This codebase is based on the Faded Parsons Problems project found here: https://github.com/pamelafox/faded-parsons-static, which is licensed under the MIT License.
The original project, a static website, allows the user to run Faded Parsons Problems in the browser. It used Pyodide for executing Python doctests and localStorage for storing user progress. The original project contained the functionality for solving and submitting faded parsons problems which were then automatically tested according to task definitions.

The repository was forked in Jan 2026, and this fork was renamed and detached in Feb 2026.

## Team
Students:
- Julia Roukala
- Sebastian Olander
- Mira Tihveräinen
- Boris Versonnen
- Vili Mähönen
- Victoria Khoreva
- Santeri Silvennoinen

Instructor:
- Sasu Paukku

## Internal team communication 
- Telegram
- Discord
- Meeting up on campus

## Logo

Project logo made by [Victoria Khoreva](https://www.instagram.com/victheliar/):
![Parsons code lab logo](ohtuproj_logo.png)
