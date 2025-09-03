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
  instance_class        = local.prod ? "db.t4g.small" : "db.t4g.micro"  # Upgrade production to small for better performance
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
  parameter_group_name = local.prod ? aws_db_parameter_group.performance[0].name : null

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
    name  = "work_mem" 
    value = "8192"   # 8MB in KB - improves sort/hash operations
  }

  parameter {
    name  = "random_page_cost"
    value = "1.1"    # Optimize for SSD storage - improves query planning
  }

  parameter {
    name  = "checkpoint_completion_target"
    value = "0.9"    # Smooth out checkpoint I/O - reduces spikes
  }

  parameter {
    name  = "effective_cache_size"
    value = "262144" # 256MB in KB - better query planner estimates for t4g.small
  }

  tags = {
    Name = "${local.name}-performance-pg"
  }
}
