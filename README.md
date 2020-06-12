# transcripts-lambdas

_Starter kit repository with all initial files and configuration to start adding new lambdas to it._

![Let the fun begin](https://media.giphy.com/media/1AgEA1GME0scObgPus/giphy.gif)

## Use 'alonzo' to generate new lambdas
_On root directory salesforce-lambdas/_
```
npm run alonzo -- --generate --name <lambda-name>
```

### Install dependencies
```
npm run alonzo -- --install <--clean-install>
npm run alonzo alonzo -- --install --lambda <lambda-name> <--clean-install>
```

### Generate zip file
```
npm run alonzo -- --zip
npm run alonzo -- --zip --lambda <lambda-name>
```

