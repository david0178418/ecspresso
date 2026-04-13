import { defineCollisionLayers } from "../../src/plugins/physics/collision";

const collisionLayers = defineCollisionLayers({
	turretProjectile: ['enemy'],
	enemy: ['turretProjectile'],
});

export default collisionLayers;
