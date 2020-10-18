#!groovy​
@Library('sprockets@2.15.1') _

def deployLambdas = {
    def l = new lambda()
    def buildTool = new node()
    String[] blacklist = ["utils"]
    
    l.deployLambdas(blacklist, buildTool, noPrefix: true)
}

node () {
    nodeCore.defaultPipeline(postBuild: deployLambdas)
}