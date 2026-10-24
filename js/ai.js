(function () {
  class TacticalBotAI {
    constructor() {
      this.reset();
    }

    reset() {
      this.patrolTarget = null;
      this.lastKnownEnemyPos = null;
      this.strafeDir = 1;
      this.strafeTimer = 0;
      this.sweepAngle = Math.PI;
      this.sweepDir = 1;
      this.decisionTimer = 0;
    }

    update(dt, bot, enemy, obstacles, arenaW, arenaH, actions, visibilityConfig) {
      if (bot.hp <= 0 || enemy.hp <= 0) return;

      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir = Math.random() < 0.5 ? -1 : 1;
        this.strafeTimer = 1.1 + Math.random() * 1.4;
      }

      const distToEnemy = Math.hypot(enemy.x - bot.x, enemy.y - bot.y);
      const angleToEnemy = Math.atan2(enemy.y - bot.y, enemy.x - bot.x);

      // Check if Bot can currently see Player 1 via line-of-sight & vision cone (or close hearing)
      const canSeeEnemy = window.PaintballVisibility.isEntityVisible(
        enemy.x,
        enemy.y,
        enemy.radius,
        bot.x,
        bot.y,
        bot.angle,
        visibilityConfig.fov,
        visibilityConfig.viewRange,
        visibilityConfig.closeSense + 70,
        obstacles
      );

      let desiredAngle = bot.angle;
      let moveX = 0;
      let moveY = 0;

      if (canSeeEnemy) {
        this.lastKnownEnemyPos = { x: enemy.x, y: enemy.y, time: performance.now() };
        desiredAngle = angleToEnemy + (Math.random() - 0.5) * 0.08;

        // Combat movement: maintain optimal paintball skirmish distance (220 - 380px) while strafing
        const perpX = -Math.sin(angleToEnemy) * this.strafeDir;
        const perpY = Math.cos(angleToEnemy) * this.strafeDir;

        if (distToEnemy > 370) {
          moveX = Math.cos(angleToEnemy) * 0.75 + perpX * 0.65;
          moveY = Math.sin(angleToEnemy) * 0.75 + perpY * 0.65;
        } else if (distToEnemy < 190) {
          moveX = -Math.cos(angleToEnemy) * 0.7 + perpX * 0.7;
          moveY = -Math.sin(angleToEnemy) * 0.7 + perpY * 0.7;
        } else {
          moveX = perpX;
          moveY = perpY;
        }

        // Fire normal paintballs if within range
        if (distToEnemy <= visibilityConfig.bulletRange * 0.96) {
          actions.shoot(desiredAngle);
        }
      } else {
        // Enemy is hidden behind cover or outside cone!
        // Check if we recently saw the enemy behind a low crate and can lob a grenade over it
        if (
          this.lastKnownEnemyPos &&
          performance.now() - this.lastKnownEnemyPos.time < 4500 &&
          bot.grenadeCooldown <= 0
        ) {
          const dLast = Math.hypot(this.lastKnownEnemyPos.x - bot.x, this.lastKnownEnemyPos.y - bot.y);
          if (dLast > 150 && dLast <= visibilityConfig.grenadeRange * 0.95) {
            const angToLast = Math.atan2(
              this.lastKnownEnemyPos.y - bot.y,
              this.lastKnownEnemyPos.x - bot.x
            );
            // Make sure no tall obstacle (container/tree) blocks the throw path
            const tallObstacles = obstacles.filter((o) => o.heightType === 'tall');
            if (
              window.PaintballVisibility.hasLineOfSight(
                bot.x,
                bot.y,
                this.lastKnownEnemyPos.x,
                this.lastKnownEnemyPos.y,
                tallObstacles
              )
            ) {
              actions.throwGrenade(angToLast, dLast);
              this.lastKnownEnemyPos = null;
            }
          }
        }

        // Navigate toward last known enemy region or patrol center-arena cover
        if (
          !this.patrolTarget ||
          Math.hypot(this.patrolTarget.x - bot.x, this.patrolTarget.y - bot.y) < 70
        ) {
          if (this.lastKnownEnemyPos && performance.now() - this.lastKnownEnemyPos.time < 6000) {
            this.patrolTarget = {
              x: this.lastKnownEnemyPos.x + (Math.random() - 0.5) * 140,
              y: this.lastKnownEnemyPos.y + (Math.random() - 0.5) * 140
            };
          } else {
            // Advance cautiously toward the player's half of the arena
            this.patrolTarget = {
              x: Math.max(200, Math.min(arenaW - 200, enemy.x + (Math.random() - 0.3) * 360)),
              y: Math.max(160, Math.min(arenaH - 160, enemy.y + (Math.random() - 0.5) * 340))
            };
          }
        }

        const toTargetAngle = Math.atan2(
          this.patrolTarget.y - bot.y,
          this.patrolTarget.x - bot.x
        );
        moveX = Math.cos(toTargetAngle);
        moveY = Math.sin(toTargetAngle);

        // Sweep vision cone back and forth while hunting
        this.sweepAngle += this.sweepDir * dt * 1.6;
        if (Math.abs(this.sweepAngle) > 0.75) {
          this.sweepDir *= -1;
        }
        desiredAngle = toTargetAngle + this.sweepAngle;
      }

      // Obstacle avoidance feelers so Bot glides around crates, containers, and trees
      const moveAngle = Math.atan2(moveY, moveX);
      const steered = this._steerAroundObstacles(bot, moveAngle, obstacles, arenaW, arenaH);
      bot.vx = Math.cos(steered) * bot.speed;
      bot.vy = Math.sin(steered) * bot.speed;

      // Smoothly rotate bot's aim angle toward desiredAngle
      const diff = window.PaintballVisibility.normalizeAngleDiff(desiredAngle, bot.angle);
      bot.angle += diff * Math.min(1, dt * 9);
    }

    _steerAroundObstacles(bot, baseAngle, obstacles, arenaW, arenaH) {
      const candidateOffsets = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.1, -2.1];
      const lookAhead = 72;

      for (let i = 0; i < candidateOffsets.length; i++) {
        const ang = baseAngle + candidateOffsets[i];
        const tx = bot.x + Math.cos(ang) * lookAhead;
        const ty = bot.y + Math.sin(ang) * lookAhead;

        if (tx < 60 || tx > arenaW - 60 || ty < 60 || ty > arenaH - 60) continue;

        let blocked = false;
        for (let j = 0; j < obstacles.length; j++) {
          const ob = obstacles[j];
          const pad = bot.radius + 12;
          if (
            tx > ob.x - pad &&
            tx < ob.x + ob.w + pad &&
            ty > ob.y - pad &&
            ty < ob.y + ob.h + pad
          ) {
            blocked = true;
            break;
          }
        }
        if (!blocked) return ang;
      }

      return baseAngle + Math.PI;
    }
  }

  window.PaintballBotAI = new TacticalBotAI();
})();
