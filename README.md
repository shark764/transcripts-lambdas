# transcripts-lambdas

_Starter kit repository with all initial files and configuration to start adding new lambdas to it._

![Let the fun begin](https://media.giphy.com/media/1AgEA1GME0scObgPus/giphy.gif)

## Lambdas:
The main lambdas function, "get-transcripts". It will return the propert format of transcripts based on the 
'artifact-type' and artifact-sub-type'that defined in the 'artifacts'. 

Currently support transcripts:
    email, sms, webchat, facebook, whatsapp

The "email-transcripts" labmda will be abdicated.

## Use 'alonzo' to generate new lambdas
_On root directory your-lambdas-repo/_
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

