// Random password for database
resource "random_password" "db_password" {
  length  = 32
  special = false
}

// Security group for database
resource "aws_security_group" "db" {
  name        = "${local.name}-db-sg"
  description = "Security group for database"
  vpc_id      = aws_vpc.this.id
}

// Security group rule for PostgreSQL access
resource "aws_security_group_rule" "postgresql_ingress" {
  type              = "ingress"
  from_port         = 5432
  to_port           = 5432
  protocol          = "tcp"
  cidr_blocks       = ["0.0.0.0/0"] # This allows public access to the database
  security_group_id = aws_security_group.db.id
}

resource "aws_security_group_rule" "postgresql_egress" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.db.id
}

// RDS PostgreSQL instance
resource "aws_db_instance" "this" {
  identifier            = local.name
  engine                = "postgres"
  engine_version        = "17"
  instance_class        = local.prod ? "db.t4g.medium" : "db.t4g.small"  # Upgrade both environments for better performance
  allocated_storage     = local.prod ? 20 : 10  # Increase storage for production
  max_allocated_storage = local.prod ? 200 : 100  # Allow more auto-scaling in production

  db_name  = "postgres"
  username = "postgres"
  password = random_password.db_password.result
  port     = 5432

  publicly_accessible     = true
  multi_az               = local.prod
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.db.id]

  backup_retention_period = 1
  backup_window           = "03:00-06:00"
  maintenance_window      = "Mon:00:00-Mon:03:00"

  # Performance optimizations
  parameter_group_name = local.prod ? aws_db_parameter_group.performance[0].name : aws_db_parameter_group.development[0].name

  skip_final_snapshot = !local.prod
  deletion_protection = local.prod
}

// Database parameter group for production performance optimization
resource "aws_db_parameter_group" "performance" {
  count  = local.prod ? 1 : 0
  family = "postgres17"
  name   = "${local.name}-performance-pg"

  # Optimize for high concurrent INSERT workload - using only dynamic parameters
  parameter {
    name         = "work_mem" 
    value        = "8192"   # 8MB in KB - improves sort/hash operations
    apply_method = "immediate"
  }

  parameter {
    name         = "random_page_cost"
    value        = "1.1"    # Optimize for SSD storage - improves query planning
    apply_method = "immediate"
  }

  parameter {
    name         = "checkpoint_completion_target"
    value        = "0.9"    # Smooth out checkpoint I/O - reduces spikes
    apply_method = "immediate"
  }

  parameter {
    name         = "effective_cache_size"
    value        = "262144" # 256MB in KB - better query planner estimates for t4g.small
    apply_method = "immediate"
  }

  # Connection pooling and timeout parameters
  parameter {
    name         = "max_connections"
    value        = "200"  # Increase from default ~115 for t4g.small
    apply_method = "pending-reboot"  # Static parameter requires reboot
  }


  parameter {
    name         = "idle_in_transaction_session_timeout"
    value        = "60000"  # Kill idle transactions after 60 seconds (in milliseconds)
    apply_method = "immediate"
  }

  parameter {
    name         = "idle_session_timeout"
    value        = "300000"  # Kill idle sessions after 5 minutes
    apply_method = "immediate"
  }

  parameter {
    name         = "statement_timeout"
    value        = "30000"  # Kill queries running longer than 30 seconds
    apply_method = "immediate"
  }

  parameter {
    name         = "log_connections"
    value        = "1"     # Log connection attempts for debugging
    apply_method = "immediate"
  }

  parameter {
    name         = "log_disconnections"
    value        = "1"     # Log disconnections for debugging
    apply_method = "immediate"
  }

  parameter {
    name         = "deadlock_timeout"
    value        = "1000"  # 1 second deadlock detection
    apply_method = "immediate"
  }

  parameter {
    name         = "log_lock_waits"
    value        = "1"     # Log lock waits for debugging
    apply_method = "immediate"
  }

  tags = {
    Name = "${local.name}-performance-pg"
  }
}

// Database parameter group for development environment
resource "aws_db_parameter_group" "development" {
  count  = local.prod ? 0 : 1
  family = "postgres17"
  name   = "${local.name}-development-pg"

  parameter {
    name         = "max_connections"
    value        = "100"  # Appropriate for t4g.micro
    apply_method = "pending-reboot"  # Static parameter requires reboot
  }
  
  
  parameter {
    name         = "idle_in_transaction_session_timeout"
    value        = "30000"  # More aggressive cleanup in dev - 30 seconds
    apply_method = "immediate"
  }
  
  parameter {
    name         = "idle_session_timeout"
    value        = "180000"  # 3 minutes in dev
    apply_method = "immediate"
  }
  
  parameter {
    name         = "statement_timeout"
    value        = "15000"  # Shorter timeout in dev - 15 seconds
    apply_method = "immediate"
  }

  parameter {
    name         = "work_mem" 
    value        = "4096"   # 4MB for dev
    apply_method = "immediate"
  }

  parameter {
    name         = "random_page_cost"
    value        = "1.1"    # Optimize for SSD storage
    apply_method = "immediate"
  }

  parameter {
    name         = "checkpoint_completion_target"
    value        = "0.9"    # Smooth out checkpoint I/O
    apply_method = "immediate"
  }

  parameter {
    name         = "effective_cache_size"
    value        = "131072" # 128MB for t4g.micro
    apply_method = "immediate"
  }

  parameter {
    name         = "log_connections"
    value        = "1"     # Log connections in dev for debugging
    apply_method = "immediate"
  }

  parameter {
    name         = "log_disconnections"
    value        = "1"     # Log disconnections in dev
    apply_method = "immediate"
  }

  parameter {
    name         = "deadlock_timeout"
    value        = "1000"  # 1 second deadlock detection
    apply_method = "immediate"
  }

  parameter {
    name         = "log_lock_waits"
    value        = "1"     # Log lock waits for debugging
    apply_method = "immediate"
  }

  tags = {
    Name = "${local.name}-development-pg"
  }
}
