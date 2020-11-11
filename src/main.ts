import { CatalystClient, DeploymentBuilder } from 'dcl-catalyst-client'
import { Entity, EntityType } from 'dcl-catalyst-commons'
import { Authenticator } from 'dcl-crypto'
import Web3 from 'web3';

let web3: Web3
let ethAddress: string
let currentName: string
let selectedName: string
let ownedNames: string[]

async function main() {
    // Connect to wallet
    await connectToWallet()

    // Get ethereum address
    web3 = new Web3(Web3.givenProvider || "ws://localhost:8545");
    const ethAddresses = await web3.eth.getAccounts()
    ethAddress = ethAddresses[0]
    ethAddress = '0x3A49309413793b32F6A308769220147feDbFfa5f'

    // Fetch owned names
    ownedNames = await fetchNames(ethAddress)
    console.log(ownedNames)

    if (ownedNames.length === 0) {
        // @ts-ignore
        Metro.infobox.create("It seems that you don't have any claimed names for this wallet. Please select a wallet that has claimed names.", "warning");
        return
    }

    // Fetch current name
    const { metadata } = await fetchProfile(ethAddress)
    const { name } = metadata.avatars[0]
    selectedName = currentName = name

    // Load all owned names into the select
    reloadOptions();

    // Set save behaviour
    // @ts-ignore
    $("#save").click(() => changeProfile())

}

function changedSelection(newName: string) {
    [ selectedName ] = newName
    console.log(newName)
    // @ts-ignore
    const button = $("#save")
    if (selectedName === currentName) {
        button.addClass("disabled")
    } else {
        button.removeClass("disabled")
    }
}

function reloadOptions() {
    const options = {};
    for (const ownedName of ownedNames) {
        options[ownedName] = ownedName.toLowerCase() === currentName.toLowerCase() ? `${ownedName} (current name)` : ownedName;
    }

    // Load the select box
    //@ts-ignore
    const select = $("#select").data("select");
    select.data(options);
    select.val(currentName);
    select.options.onChange = changedSelection;
}

async function changeProfile(): Promise<void> {
    // Fetch the latest version, and update the name
    const profile = await fetchProfile(ethAddress)
    const avatar = profile.metadata.avatars[0]
    avatar.name = selectedName
    avatar.hasClaimedName = true

    // Build entity
    const content = new Map((profile.content || []).map(({ file, hash }) => [file, hash]))

    const deployPreparationData = await DeploymentBuilder.buildEntityWithAlreadyUploadedHashes(EntityType.PROFILE, [ethAddress], content, profile.metadata)

    // Request signature
    const signature = await web3.eth.personal.sign(deployPreparationData.entityId, ethAddress, '')

    // Deploy change
    const authChain = Authenticator.createSimpleAuthChain(deployPreparationData.entityId, ethAddress, signature)
    const client = new CatalystClient('https://peer.decentraland.org', 'name-changer')
    await client.deployEntity({ ...deployPreparationData, authChain })

    // @ts-ignore
    Metro.infobox.open($("#info-box"))

    // Set the name as current
    currentName = selectedName
    changedSelection(selectedName)
    reloadOptions()
}

async function fetchProfile(ethAddress: string): Promise<Entity> {
    const client = new CatalystClient('https://peer.decentraland.org', 'name-changer')
    const entities = await client.fetchEntitiesByPointers(EntityType.PROFILE, [ethAddress.toLowerCase()])
    if (entities.length == 0) {
        throw new Error('Failed to find an profile for that address')
    }
    return entities[0]
}

async function connectToWallet() {
    // @ts-ignore
    if(window.ethereum) {
        // @ts-ignore
        await ethereum.enable();
    } else {
        throw new Error('Failed to find wallet')
    }

}

const query = `
  query GetNameByBeneficiary($beneficiary: String) {
    nfts(first:1000, where: { owner: $beneficiary, category: ens }) {
      ens {
        labelHash
        beneficiary
        caller
        subdomain
        createdAt
      }
    }
  }`

const opts = (ethAddress: string) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { beneficiary: ethAddress.toLowerCase() } })
})

async function fetchNames(ethAddress: string): Promise<string[]> {
    const totalAttempts = 5
    for(let attempt=0; attempt<totalAttempts; attempt++) {
        try {
            const response = await fetch('https://api.thegraph.com/subgraphs/name/decentraland/marketplace', opts(ethAddress))
            if (response.ok) {
                const jsonResponse: GraphResponse = await response.json()
                console.log(jsonResponse)
                return jsonResponse.data.nfts.map(nft => nft.ens.subdomain)
            }
        } catch (error) {
            console.log(`Could not retrieve ENS for address ${ethAddress}. Try ${attempt} of ${totalAttempts}.`, error)
        }
    }
    return []
}

type GraphResponse = {
    data: {
        nfts: {
            ens: {
                subdomain: string
            }
        }[]
    }
}


main()