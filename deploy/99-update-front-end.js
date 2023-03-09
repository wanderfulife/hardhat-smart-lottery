const { ethers, network } = require("hardhat")
const fs = require("fs")

const FRONT_END_LOCATION_ADDRESSES_FILE = "../nxt/constants/contractAddresses.json"
const FRONT_END_ABI_FILE = "../nxt/constants/abi.json"

module.exports = async function () {
    if (process.env.UPDATE_FRONTEND) {
        console.log("updating front end")
		updateContractAddresses()
		updateAbi() 
    }
}

async function updateAbi() {
    const Lottery = await ethers.getContract("Lottery")
	fs.writeFileSync(FRONT_END_ABI_FILE, Lottery.interface.format(ethers.utils.FormatTypes.json))
}

async function updateContractAddresses() {
    const Lottery = await ethers.getContract("Lottery")
    const chainId = network.config.chainId.toString()
    const currentAddresses = JSON.parse(fs.readFileSync(FRONT_END_LOCATION_ADDRESSES_FILE, "utf8"))
    if (chainId in currentAddresses) {
        if (!currentAddresses[chainId].includes(Lottery.address)) {
            currentAddresses[chainId].push(Lottery.address)
        }
    }
    {
        currentAddresses[chainId] = [Lottery.address]
    }
    fs.writeFileSync(FRONT_END_LOCATION_ADDRESSES_FILE, JSON.stringify(currentAddresses))
}

module.exports.tags = ["all", "frontend"]
