const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers, getChainId } = require("hardhat")
const { isCallTrace } = require("hardhat/internal/hardhat-network/stack-traces/message-trace")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery unit test", function () {
          let lottery, lotteryEntranceFee, deployer

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              lottery = await ethers.getContract("Lottery", deployer)
              lotteryEntranceFee = await lottery.getEntranceFee()
          })
          describe("fulfillRandomWords", function () {
              it("Work with live chainlink Keeper and chainlink VRF, we get a random winner", async function () {
                  //enter the raffle
                  const startingTimeStamp = await lottery.getLatestTimeStamp()
                  const accounts = await ethers.getSigners()
                  await new Promise(async (resolve, reject) => {
                      //setup a listener before we enter the raffle
                      //just in case the blockchain moves really fast
                      lottery.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          resolve()
                          try {
                              //add our asserts here
                              const recentWinner = await lottery.getRecentWinner()
                              const raffleState = await lottery.getLotteryState()
                              const winnerEndingBalance = await accounts[0].getBalance()
                              const endingTimeStamp = await lottery.getLatestTimeStamp()

                              await expect(lottery.getPlayer(0)).to.be.reverted
                              assert.equal(recentWinner.toString(), accounts[0].address)
                              assert.equal(raffleState, 0)
                              assert.equal(
                                  winnerEndingBalance.toString(),
                                  winnerStartingBalance.add(lotteryEntranceFee).toString()
                              )
							  assert(endingTimeStamp > startingTimeStamp)
							  resolve()
                          } catch (e) {
                              console.log(e)
                              reject(e)
                          }
                      })
                      await lottery.enterRaffle({ value: lotteryEntranceFee })
                      const winnerStartingBalance = await accounts[0].getBalance()
                      //This code will note complete until our listener has finished listening!
                  })
              })
          })
      })
