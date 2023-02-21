const { assert, expect } = require("chai")
const { network, getNamedAccounts, deployments, ethers, getChainId } = require("hardhat")
const { developmentChains, networkConfig } = require("../../helper-hardhat-config")

!developmentChains.includes(network.name)
    ? describe.skip
    : describe("Lottery unit test", function () {
          let lottery, VRFCoordinatorV2Mock, lotteryEntranceFee, deployer, interval
          const chainId = network.config.chainId

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              await deployments.fixture(["all"])
              lottery = await ethers.getContract("Lottery", deployer)
              VRFCoordinatorV2Mock = await ethers.getContract("VRFCoordinatorV2Mock", deployer)
              lotteryEntranceFee = await lottery.getEntranceFee()
              interval = await lottery.getInterval()
          })

          describe("constructor", function () {
              it("initialiazes the lottery correctly", async function () {
                  const raffleState = await lottery.getLotteryState()

                  assert.equal(raffleState.toString(), "0")
                  assert.equal(interval.toString(), networkConfig[chainId]["interval"])
              })
          })

          describe("enter Lottery", function () {
              it("revert when you don't pay enough", async function () {
                  await expect(lottery.enterRaffle()).to.be.revertedWith(
                      "Lottery__NotEnoughETHEntered"
                  )
              })
          })
          it("records players when they enter", async function () {
              await lottery.enterRaffle({ value: lotteryEntranceFee })
              const playerFromContact = await lottery.getPlayer(0)
              assert.equal(playerFromContact, deployer)
          })
          it("emits event on enter", async function () {
              await expect(lottery.enterRaffle({ value: lotteryEntranceFee })).to.emit(
                  lottery,
                  "RaffleEnter"
              )
          })
          it("it doesn't allow entrance when lottery is calculating", async function () {
              await lottery.enterRaffle({ value: lotteryEntranceFee })
              await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
              await network.provider.send("evm_mine", [])
              //We pretend to be a chainlink keeper
              await lottery.performUpkeep([])
              await expect(lottery.enterRaffle({ value: lotteryEntranceFee })).to.be.revertedWith(
                  "Lottery__NotOpen"
              )
          })
          describe("checkUpkeep", function () {
              it("it returns false if people haven't send ETH", async function () {
                  await network.provider.send("evm_mine", [])
                  //We pretend to be a chainlink keeper
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert(!upkeepNeeded)
              })

              it("returns false if raffle isn't open", async function () {
                  await lottery.enterRaffle({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1])
                  await network.provider.send("evm_mine", [])
                  await lottery.performUpkeep([])
                  const lotteryState = await lottery.getLotteryState()
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep([])
                  assert.equal(lotteryState.toString(), "1")
                  assert(!upkeepNeeded)
              })
              it("returns false if enough time hasn't passed", async () => {
                  await lottery.enterRaffle({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() - 5]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(!upkeepNeeded)
              })
              it("returns true if enough time hasn't passed", async () => {
                  await lottery.enterRaffle({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const { upkeepNeeded } = await lottery.callStatic.checkUpkeep("0x") // upkeepNeeded = (timePassed && isOpen && hasBalance && hasPlayers)
                  assert(upkeepNeeded)
              })
          })
          describe("performUpKeep", function () {
              it("can only run if checkUpKeep is true", async function () {
                  await lottery.enterRaffle({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const tx = await lottery.checkUpkeep("0x")
                  assert(tx)
              })
              it("revert when checkUpKeep is false", async function () {
                  await expect(lottery.performUpkeep([])).to.be.revertedWith(
                      "Lottery__UpKeepNotNeeded"
                  )
              })
              it("updates the lottery state,emit an event and calls the vrf coordinator", async function () {
                  await lottery.enterRaffle({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) // use a higher number here if this test fails
                  await network.provider.request({ method: "evm_mine", params: [] })
                  const txReceipt = await lottery.performUpkeep([])
                  const txResponse = await txReceipt.wait(1)
                  const requestId = txResponse.events[1].args.requestId
                  const raffleState = await lottery.getLotteryState()
                  assert(requestId.toNumber() > 0)
                  assert(raffleState.toString() == "1")
              })
          })
          describe("fulfillRandomWords", function () {
              beforeEach(async function () {
                  await lottery.enterRaffle({ value: lotteryEntranceFee })
                  await network.provider.send("evm_increaseTime", [interval.toNumber() + 1]) // use a higher number here if this test fails
                  await network.provider.send("evm_mine", [])
              })
              it("can only be call after performUpKeep", async function () {
                  await expect(
                      VRFCoordinatorV2Mock.fulfillRandomWords(0, lottery.address)
                  ).to.be.revertedWith("nonexistent request")
                  await expect(
                      VRFCoordinatorV2Mock.fulfillRandomWords(1, lottery.address)
                  ).to.be.revertedWith("nonexistent request")
              })
              it("pick a winner, reset the lottery and send the money", async function () {
                  const additionalEntrants = 3
                  const startingAccountIndex = 1
                  const accounts = await ethers.getSigners()
                  for (
                      let i = startingAccountIndex;
                      i < startingAccountIndex + additionalEntrants;
                      i++
                  ) {
                      const accountConnectedLottery = lottery.connect(accounts[i])
                      await accountConnectedLottery.enterRaffle({ value: lotteryEntranceFee })
                  }
                  const startingTimeStamp = await lottery.getLatestTimeStamp()
                  //performUpKeep() (mock being chainlink Keeper)
                  //fulfillRandomWord() (mock being chainlink VRF)
                  //We will have to waitfor the fulfill random to be called
                  await new Promise(async (resolve, reject) => {
                      lottery.once("WinnerPicked", async () => {
                          console.log("Found the event!")
                          try {
                              const recentWinner = await lottery.getRecentWinner()
                              console.log(recentWinner)
                              console.log(accounts[2].address)
                              console.log(accounts[0].address)
                              console.log(accounts[1].address)
                              console.log(accounts[3].address)
                              const raffleState = await lottery.getLotteryState()
                              const endingTimeStamp = await lottery.getLatestTimeStamp()
                              const numPlayers = await lottery.getNumberOfPlayers()
                              const winneEndiningBalance = await accounts[1].getBalance()

                              assert.equal(numPlayers.toString(), "0")
                              assert.equal(raffleState.toString(), "0")
                              assert(endingTimeStamp > startingTimeStamp)
                              assert.equal(
                                  winneEndiningBalance.toString(),
                                  winnerStartingBalance.add(
                                      lotteryEntranceFee
                                          .mul(additionalEntrants)
                                          .add(lotteryEntranceFee)
                                          .toString()
                                  )
                              )
                          } catch (e) {
                              reject(e)
                          }
                          resolve()
                      })
                      const tx = await lottery.performUpkeep([])
                      const txReceipt = await tx.wait(1)
                      const winnerStartingBalance = await accounts[1].getBalance()
                      await VRFCoordinatorV2Mock.fulfillRandomWords(
                          txReceipt.events[1].args.requestId,
                          lottery.address
                      )
                  })
              })
          })
      })
