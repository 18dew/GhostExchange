const { expectRevert, time } = require("@openzeppelin/test-helpers");
const GhostToken = artifacts.require("GhostToken");
const KingGhost = artifacts.require("KingGhost");
const MockERC20 = artifacts.require("MockERC20");
const UniswapV2Pair = artifacts.require("UniswapV2Pair");
const UniswapV2Factory = artifacts.require("UniswapV2Factory");
const UniswapV2Router = artifacts.require("UniswapV2Router02");
const Migrator = artifacts.require("Migrator2");

contract("Migrator", ([alice, bob, dev, minter]) => {
  beforeEach(async () => {
    this.factory1 = await UniswapV2Factory.new(alice, { from: alice });
    this.factory2 = await UniswapV2Factory.new(alice, { from: alice });
    this.ghost = await GhostToken.new({ from: alice });
    this.weth = await MockERC20.new("WETH", "WETH", "100000000", {
      from: minter,
    });
    this.router1 = await UniswapV2Router.new(
      this.factor1.address,
      this.weth.address
    );
    this.router2 = await UniswapV2Router.new(
      this.factor2.address,
      this.weth.address
    );
    this.token = await MockERC20.new("TOKEN", "TOKEN", "100000000", {
      from: minter,
    });
    this.lp1 = await UniswapV2Pair.at(
      (await this.factory1.createPair(this.weth.address, this.token.address))
        .logs[0].args.pair
    );
    this.lp2 = await UniswapV2Pair.at(
      (await this.factory2.createPair(this.weth.address, this.token.address))
        .logs[0].args.pair
    );
    this.king = await KingGhost.new(
      this.ghost.address,
      dev,
      "1000",
      "0",
      "100000",
      { from: alice }
    );
    this.migrator = await Migrator.new(
      this.router1.address,
      this.router2.address,
      this.king.address
    );
    await this.ghost.transferOwnership(this.king.address, { from: alice });
    await this.king.add("100", this.lp1.address, { from: alice });
  });

  it("should do the migration successfully", async () => {
    await this.token.transfer(this.lp1.address, "10000000", { from: minter });
    await this.weth.transfer(this.lp1.address, "500000", { from: minter });
    await this.lp1.mint(minter);
    assert.equal((await this.lp1.balanceOf(minter)).valueOf(), "2235067");
    // Add some fake revenue
    await this.token.transfer(this.lp1.address, "100000", { from: minter });
    await this.weth.transfer(this.lp1.address, "5000", { from: minter });
    await this.lp1.sync();
    await this.lp1.approve(this.king.address, "100000000000", { from: minter });
    await this.king.deposit("0", "2000000", { from: minter });
    assert.equal(
      (await this.lp1.balanceOf(this.king.address)).valueOf(),
      "2000000"
    );
    await this.king.migrate(0);
    assert.equal((await this.lp1.balanceOf(this.king.address)).valueOf(), "0");
    assert.equal(
      (await this.lp2.balanceOf(this.king.address)).valueOf(),
      "2000000"
    );
    await this.king.withdraw("0", "2000000", { from: minter });
    await this.lp2.transfer(this.lp2.address, "2000000", { from: minter });
    await this.lp2.burn(bob);
    assert.equal((await this.token.balanceOf(bob)).valueOf(), "9033718");
    assert.equal((await this.weth.balanceOf(bob)).valueOf(), "451685");
  });

  it("should allow first minting from public only after migrator is gone", async () => {
    await this.factory2.setMigrator(this.migrator.address, { from: alice });
    this.tokenx = await MockERC20.new("TOKENX", "TOKENX", "100000000", {
      from: minter,
    });
    this.lpx = await UniswapV2Pair.at(
      (await this.factory2.createPair(this.weth.address, this.tokenx.address))
        .logs[0].args.pair
    );
    await this.weth.transfer(this.lpx.address, "10000000", { from: minter });
    await this.tokenx.transfer(this.lpx.address, "500000", { from: minter });
    await expectRevert(this.lpx.mint(minter), "Must not have migrator");
    await this.factory2.setMigrator(
      "0x0000000000000000000000000000000000000000",
      { from: alice }
    );
    await this.lpx.mint(minter);
  });
});
