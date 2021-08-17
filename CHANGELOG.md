# Change Log
All notable changes to this project will be documented in this file. This change log follows the conventions of [keepachangelog.com](http://keepachangelog.com/).

## [1.2.1](https://github.com/SerenovaLLC/transcripts-lambdas/compare/1.1.3...1.2.1)
### Added
- Set the 'get-transcripts' to be the main lambda, and the 'email-transcripts' will be abdicated.
- CXV1-27004: Support sms transcripts. 
- CXV1-27255: Support facebook transcripts.
- CXV1-27253: Support whatsapp transcripts.

## [1.1.3](https://github.com/SerenovaLLC/transcripts-lambdas/compare/1.1.2...1.1.3)
### Fixed
- CXV1-24278: fixed the bug that web chat artifact did not include the attached file name.

## [1.1.2](https://github.com/SerenovaLLC/transcripts-lambdas/compare/1.0.1...1.1.2)
### Added
- CXV1-23909: Initial chat_transcript implementation.

## [1.0.1](https://github.com/SerenovaLLC/transcripts-lambdas/compare/1.0.0...1.0.1)
### Fixed
- CXV1-23871: Fixed email transcipt throws error if html does not exists. Included text from plain file.

## [1.0.0](https://github.com/SerenovaLLC/transcripts-lambdas/compare/0f980eeee44589c7a22f264b4fb09a70c4540160...1.0.0)
### Added
- Inital email transcipt implementation
