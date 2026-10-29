Assess each dimension independently, from 1 (serious deficiencies) to 10 (strong evidence):

- implementationCorrectness: behavior, edge conditions, failure paths, and regressions.
- idiomaticity: alignment with the language and surrounding project conventions.
- complexity: clarity and the amount of machinery justified by the problem.
- testRiskCoverage: meaningful assertions for behaviors with substantial failure risk.
- documentation: explanations of intent, unusual constraints, and public interfaces where needed.
- securitySafety: trust boundaries, secret handling, input validation, and data protection.

Also provide verdict (pass or fail) and summary (Markdown). These are the only eight fields. Scores describe the review; verdict is the binding code decision. State the limits of static analysis and that tests were not executed.
