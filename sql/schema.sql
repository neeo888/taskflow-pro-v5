-- TaskFlow Pro — MySQL Schema
CREATE DATABASE IF NOT EXISTS taskflow CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE taskflow;

CREATE TABLE IF NOT EXISTS tf_users (
  id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  wwcode      VARCHAR(20)     NOT NULL UNIQUE,
  name        VARCHAR(120)    NOT NULL,
  role        VARCHAR(100)    DEFAULT '',
  dept        VARCHAR(100)    DEFAULT '',
  dept_key    VARCHAR(20)     DEFAULT '',
  branch      VARCHAR(20)     DEFAULT '',
  branch_name VARCHAR(60)     DEFAULT '',
  email       VARCHAR(120)    DEFAULT '',
  urole       ENUM('admin','manager','assistant','user') DEFAULT 'user',
  color       TINYINT UNSIGNED DEFAULT 0,
  avatar_path VARCHAR(255)    DEFAULT '',
  avatar_url  VARCHAR(255)    DEFAULT '',
  pass_hash   VARCHAR(255)    DEFAULT '',
  last_login  DATETIME,
  created_at  DATETIME        DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tf_sessions (
  token       VARCHAR(64)     PRIMARY KEY,
  user_id     INT UNSIGNED    NOT NULL,
  expires_at  DATETIME        NOT NULL,
  created_at  DATETIME        DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES tf_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tf_tasks (
  id          INT UNSIGNED    AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200)    NOT NULL,
  description TEXT            DEFAULT '',
  col         VARCHAR(20)     DEFAULT 'todo',
  priority    VARCHAR(10)     DEFAULT 'normal',
  prog        TINYINT         DEFAULT 0,
  due_date    DATE,
  branch      VARCHAR(20)     DEFAULT '',
  dept_key    VARCHAR(20)     DEFAULT '',
  tags        JSON,
  created_by  INT UNSIGNED    NOT NULL,
  submit_note TEXT            DEFAULT '',
  verified_by INT UNSIGNED,
  ack_by      JSON,
  created_at  DATETIME        DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES tf_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tf_task_assignees (
  task_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (task_id, user_id),
  FOREIGN KEY (task_id) REFERENCES tf_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES tf_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tf_task_steps (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id    INT UNSIGNED NOT NULL,
  label      VARCHAR(200) NOT NULL,
  sort_order TINYINT      DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES tf_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tf_step_checks (
  step_id    INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  task_id    INT UNSIGNED NOT NULL,
  is_done    TINYINT(1)   DEFAULT 0,
  checked_at DATETIME,
  PRIMARY KEY (step_id, user_id),
  FOREIGN KEY (step_id) REFERENCES tf_task_steps(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES tf_users(id)      ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tf_tasks(id)      ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tf_attachments (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id      INT UNSIGNED NOT NULL,
  is_submitted TINYINT(1)   DEFAULT 0,
  file_name    VARCHAR(255) NOT NULL,
  file_size    VARCHAR(20)  DEFAULT '',
  file_type    VARCHAR(20)  DEFAULT '',
  file_path    VARCHAR(255) NOT NULL,
  file_url     VARCHAR(255) DEFAULT '',
  uploaded_by  INT UNSIGNED NOT NULL,
  uploaded_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id)     REFERENCES tf_tasks(id)  ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by) REFERENCES tf_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tf_obstacles (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id     INT UNSIGNED NOT NULL,
  title       VARCHAR(200) NOT NULL,
  description TEXT         DEFAULT '',
  level       VARCHAR(10)  DEFAULT 'med',
  author_id   INT UNSIGNED NOT NULL,
  resolved    TINYINT(1)   DEFAULT 0,
  resolved_at DATETIME,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id)   REFERENCES tf_tasks(id)  ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES tf_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tf_comments (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id     INT UNSIGNED NOT NULL,
  obstacle_id INT UNSIGNED,
  author_id   INT UNSIGNED NOT NULL,
  body        TEXT         NOT NULL,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id)     REFERENCES tf_tasks(id)     ON DELETE CASCADE,
  FOREIGN KEY (obstacle_id) REFERENCES tf_obstacles(id) ON DELETE SET NULL,
  FOREIGN KEY (author_id)   REFERENCES tf_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tf_progress_log (
  id        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  task_id   INT UNSIGNED NOT NULL,
  user_id   INT UNSIGNED NOT NULL,
  prog      TINYINT      NOT NULL,
  note      TEXT         DEFAULT '',
  logged_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tf_tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES tf_users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tf_notifications (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type        VARCHAR(30)  NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        TEXT         DEFAULT '',
  task_id     INT UNSIGNED,
  for_user_id INT UNSIGNED NOT NULL,
  is_read     TINYINT(1)   DEFAULT 0,
  is_acked    TINYINT(1)   DEFAULT 0,
  created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id)     REFERENCES tf_tasks(id) ON DELETE SET NULL,
  FOREIGN KEY (for_user_id) REFERENCES tf_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX IF NOT EXISTS idx_notif_user ON tf_notifications(for_user_id, is_read);

-- Global tag list (แยกจาก JSON ใน tf_tasks.tags)
CREATE TABLE IF NOT EXISTS tf_tags (
  id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(60)  NOT NULL UNIQUE,
  created_at DATETIME     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- Seed default tags (ถ้ายังไม่มี)
INSERT IGNORE INTO tf_tags (name) VALUES
  ('ออกแบบ'),('พัฒนา'),('ด่วน'),('การตลาด'),('ข้อมูล'),('วิจัย'),('QA'),('DevOps');
