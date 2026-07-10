<?php
$host = "localhost";
$user = "root";
$pass = "";
$db   = "taskflow";
try {
    $db_link = new PDO("mysql:host=$host;dbname=$db;charset=utf8", $user, $pass);
    $db_link->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    die("Connection failed: " . $e->getMessage());
}
?>